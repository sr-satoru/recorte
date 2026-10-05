pub mod ffmpeg;
pub mod queue;
pub mod server;
pub mod system;

use std::path::PathBuf;
use std::sync::Arc;

pub use ffmpeg::{
    crop_video, detect_dimensions, CropJobOptions, DetectedDimensions, ProgressUpdate,
    DEFAULT_FFMPEG_CROP_TEMPLATE,
};
pub use queue::{spawn_queue_worker, DetailedQueueResponse, QueueItemRecord, QueueManager};
pub use server::{start_http_server, AppState};
pub use system::{create_folder, list_directories, resolve_folder_candidate, resolve_video_path, scan_folder_for_videos};

pub struct EngineConfig {
    pub db_path: PathBuf,
    pub http_port: u16,
    pub ffmpeg_root: Option<String>,
    pub ffmpeg_options: Option<String>,
    pub default_output_folder: Option<String>,
    pub path_mappings: Option<String>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        let db_dir = dirs::data_local_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
            .join("Star");
        let db_path = db_dir.join("queue.db");

        Self {
            db_path,
            http_port: 4200,
            ffmpeg_root: None,
            ffmpeg_options: None,
            default_output_folder: None,
            path_mappings: None,
        }
    }
}

pub struct EngineHandle {
    pub queue: QueueManager,
    pub app_state: Arc<AppState>,
}

pub async fn start_engine(config: EngineConfig) -> Result<EngineHandle, String> {
    let queue = QueueManager::new(
        &config.db_path,
        config.ffmpeg_root,
        config.ffmpeg_options,
        config.default_output_folder,
        config.path_mappings.as_deref(),
    )?;

    spawn_queue_worker(queue.clone());

    let app_state = Arc::new(AppState {
        queue: queue.clone(),
    });

    let state_for_server = app_state.clone();
    let port = config.http_port;

    tokio::spawn(async move {
        if let Err(e) = start_http_server(port, state_for_server).await {
            eprintln!("[Star Core] Erro no servidor HTTP na porta {}: {}", port, e);
        }
    });

    // Ensure FFmpeg is available in the dedicated app folder
    tokio::spawn(async {
        if !ffmpeg::is_app_ffmpeg_ready() {
            println!("[Star Engine] FFmpeg dedicado não encontrado na pasta do app. Iniciando download automático em segundo plano...");
            if let Err(e) = ffmpeg::ensure_app_ffmpeg().await {
                eprintln!("[Star Engine] Aviso: Falha no download automático do FFmpeg dedicado: {}", e);
            }
        } else {
            let (ff, _) = ffmpeg::get_app_ffmpeg_paths();
            println!("[Star Engine] FFmpeg dedicado ativo em: {}", ff.display());
        }
    });

    Ok(EngineHandle { queue, app_state })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_queue_lifecycle() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test_queue.db");

        let manager = QueueManager::new(&db_path, None, None, None, None).unwrap();

        let pos = manager
            .add_to_queue("/path/to/video1.mkv", None, None)
            .unwrap();
        assert_eq!(pos, 0);

        let items = manager.get_queue_items();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0], "/path/to/video1.mkv");

        let detailed = manager.get_detailed_queue_items();
        assert_eq!(detailed.items.len(), 1);
        assert_eq!(detailed.items[0].status, "pending");

        let removed = manager.remove_from_queue("/path/to/video1.mkv").unwrap();
        assert!(removed);

        let items_after = manager.get_queue_items();
        assert_eq!(items_after.len(), 0);
    }

    #[test]
    fn test_list_directories() {
        let listing = list_directories(None);
        assert!(listing.success);
        assert!(!listing.shortcuts.is_empty());
    }
}
