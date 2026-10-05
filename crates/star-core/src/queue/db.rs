use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, Notify};

use crate::ffmpeg::{crop_video, CropJobOptions, ProgressUpdate};
use crate::system::resolve_video_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItemRecord {
    pub id: i64,
    pub path: String,
    pub crop: Option<String>,
    pub output_folder: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedQueueResponse {
    pub items: Vec<QueueItemRecord>,
    #[serde(rename = "inProgress")]
    pub in_progress: bool,
    #[serde(rename = "activeItem")]
    pub active_item: Option<String>,
    #[serde(rename = "currentProgress")]
    pub current_progress: Option<ProgressUpdate>,
}

#[derive(Clone)]
pub struct QueueManager {
    conn: Arc<Mutex<Connection>>,
    pub is_cancelled: Arc<AtomicBool>,
    pub active_item: Arc<Mutex<Option<String>>>,
    pub current_progress: Arc<Mutex<Option<ProgressUpdate>>>,
    pub progress_tx: broadcast::Sender<ProgressUpdate>,
    pub notify_worker: Arc<Notify>,
    pub default_output_folder: Option<String>,
    pub ffmpeg_root: Option<String>,
    pub ffmpeg_options: Option<String>,
    pub path_mappings: Vec<(String, String)>,
}

impl QueueManager {
    pub fn new(
        db_path: &Path,
        ffmpeg_root: Option<String>,
        ffmpeg_options: Option<String>,
        output_folder: Option<String>,
        path_mappings_str: Option<&str>,
    ) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Erro ao abrir banco SQLite ({}): {}", db_path.display(), e))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE,
                crop TEXT,
                output_folder TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|e| format!("Erro ao criar tabela queue: {}", e))?;

        let (progress_tx, _) = broadcast::channel(64);

        let path_mappings = if let Some(s) = path_mappings_str {
            s.split(',')
                .filter(|m| !m.trim().is_empty())
                .filter_map(|m| {
                    let mut parts = m.split(':');
                    let a = parts.next()?.trim().to_string();
                    let b = parts.next()?.trim().to_string();
                    Some((a, b))
                })
                .collect()
        } else {
            Vec::new()
        };

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            is_cancelled: Arc::new(AtomicBool::new(false)),
            active_item: Arc::new(Mutex::new(None)),
            current_progress: Arc::new(Mutex::new(None)),
            progress_tx,
            notify_worker: Arc::new(Notify::new()),
            default_output_folder: output_folder,
            ffmpeg_root,
            ffmpeg_options,
            path_mappings,
        })
    }

    pub fn apply_path_mappings(&self, mut path: String) -> String {
        for (from, to) in &self.path_mappings {
            path = path.replace(from, to);
        }
        path
    }

    pub fn add_to_queue(
        &self,
        path: &str,
        crop: Option<&serde_json::Value>,
        output_folder: Option<&str>,
    ) -> Result<i64, String> {
        let mapped = self.apply_path_mappings(path.to_string());
        let crop_str = crop.map(|c| c.to_string());
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "INSERT INTO queue (path, crop, output_folder, status)
             VALUES (?1, ?2, ?3, 'pending')
             ON CONFLICT(path) DO UPDATE SET
                crop = excluded.crop,
                output_folder = excluded.output_folder,
                status = 'pending'",
            params![mapped, crop_str, output_folder],
        )
        .map_err(|e| format!("Erro ao inserir na fila: {}", e))?;

        let pos: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM queue WHERE status = 'pending' AND created_at <= (SELECT created_at FROM queue WHERE path = ?1)",
                params![mapped],
                |row| row.get(0),
            )
            .unwrap_or(0);

        drop(conn);
        self.notify_worker.notify_one();

        Ok((pos - 1).max(0))
    }

    pub fn remove_from_queue(&self, path: &str) -> Result<bool, String> {
        let mapped = self.apply_path_mappings(path.to_string());
        let conn = self.conn.lock().unwrap();
        let changes = conn
            .execute(
                "UPDATE queue SET status = 'cancelled' WHERE path = ?1 AND status = 'pending'",
                params![mapped],
            )
            .map_err(|e| format!("Erro ao remover da fila: {}", e))?;

        Ok(changes > 0)
    }

    pub fn cancel_active_job(&self) -> bool {
        let active = self.active_item.lock().unwrap().clone();
        if let Some(path) = active {
            self.is_cancelled.store(true, Ordering::SeqCst);
            let conn = self.conn.lock().unwrap();
            let _ = conn.execute(
                "UPDATE queue SET status = 'cancelled' WHERE path = ?1",
                params![path],
            );
            true
        } else {
            false
        }
    }

    pub fn get_queue_items(&self) -> Vec<String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = match conn.prepare("SELECT path FROM queue WHERE status = 'pending' ORDER BY created_at ASC") {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let items: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default();

        let mut res = Vec::new();
        if let Some(active) = self.active_item.lock().unwrap().clone() {
            res.push(active);
        }
        res.extend(items);
        res
    }

    pub fn get_detailed_queue_items(&self) -> DetailedQueueResponse {
        let conn = self.conn.lock().unwrap();
        let mut stmt = match conn.prepare(
            "SELECT id, path, crop, output_folder, status, created_at FROM queue ORDER BY id DESC LIMIT 100",
        ) {
            Ok(s) => s,
            Err(_) => {
                return DetailedQueueResponse {
                    items: Vec::new(),
                    in_progress: false,
                    active_item: None,
                    current_progress: None,
                }
            }
        };

        let items: Vec<QueueItemRecord> = stmt
            .query_map([], |row| {
                Ok(QueueItemRecord {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    crop: row.get(2)?,
                    output_folder: row.get(3)?,
                    status: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default();

        let active = self.active_item.lock().unwrap().clone();
        let in_progress = active.is_some();
        let current_progress = self.current_progress.lock().unwrap().clone();

        DetailedQueueResponse {
            items,
            in_progress,
            active_item: active,
            current_progress,
        }
    }

    pub fn get_next_pending(&self) -> Option<QueueItemRecord> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, path, crop, output_folder, status, created_at FROM queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
            [],
            |row| {
                Ok(QueueItemRecord {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    crop: row.get(2)?,
                    output_folder: row.get(3)?,
                    status: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .ok()
    }

    pub fn update_status(&self, path: &str, status: &str) {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute(
            "UPDATE queue SET status = ?1 WHERE path = ?2",
            params![status, path],
        );
    }
}

pub fn spawn_queue_worker(manager: QueueManager) {
    tokio::spawn(async move {
        loop {
            let next_item = manager.get_next_pending();
            if let Some(item) = next_item {
                *manager.active_item.lock().unwrap() = Some(item.path.clone());
                manager.is_cancelled.store(false, Ordering::SeqCst);

                let dest_folder = item
                    .output_folder
                    .clone()
                    .or_else(|| manager.default_output_folder.clone());

                let actual_path = resolve_video_path(&item.path, dest_folder.as_deref());
                let actual_path_str = actual_path.to_string_lossy().to_string();

                let mut target_output = "in-place".to_string();
                if let Some(ref dest) = dest_folder {
                    if !dest.trim().is_empty() {
                        let _ = std::fs::create_dir_all(dest);
                        if let Some(fname) = actual_path.file_name() {
                            target_output = Path::new(dest).join(fname).to_string_lossy().to_string();
                        }
                    }
                }

                let mut crop_coords = [0u32; 4];
                if let Some(ref c_str) = item.crop {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(c_str) {
                        if let Some(arr) = val.as_array() {
                            if arr.len() == 4 {
                                crop_coords[0] = arr[0].as_u64().unwrap_or(0) as u32;
                                crop_coords[1] = arr[1].as_u64().unwrap_or(0) as u32;
                                crop_coords[2] = arr[2].as_u64().unwrap_or(0) as u32;
                                crop_coords[3] = arr[3].as_u64().unwrap_or(0) as u32;
                            }
                        }
                    }
                }

                if crop_coords[0] == 0 && crop_coords[1] == 0 {
                    if let Ok(detected) = crate::ffmpeg::detect_dimensions(&actual_path_str, manager.ffmpeg_root.as_deref()).await {
                        crop_coords = [
                            detected.actual_width,
                            detected.actual_height,
                            detected.left_offset,
                            detected.top_offset,
                        ];
                    }
                }

                let opts = CropJobOptions {
                    ffmpeg_root: manager.ffmpeg_root.clone(),
                    ffmpeg_options: manager.ffmpeg_options.clone(),
                    crop: crop_coords,
                    metadata: false,
                    duration: 0.0,
                };

                let result = crop_video(
                    &actual_path_str,
                    &target_output,
                    opts,
                    manager.is_cancelled.clone(),
                    manager.current_progress.clone(),
                    Some(manager.progress_tx.clone()),
                )
                .await;

                if manager.is_cancelled.load(Ordering::SeqCst) {
                    manager.update_status(&item.path, "cancelled");
                } else {
                    match result {
                        Ok(_) => manager.update_status(&item.path, "completed"),
                        Err(e) => {
                            eprintln!("Erro no processamento do vídeo {}: {}", item.path, e);
                            manager.update_status(&item.path, "failed");
                        }
                    }
                }

                *manager.active_item.lock().unwrap() = None;
                *manager.current_progress.lock().unwrap() = None;
                manager.is_cancelled.store(false, Ordering::SeqCst);
            } else {
                // Wait for notification when new job arrives
                manager.notify_worker.notified().await;
            }
        }
    });
}
