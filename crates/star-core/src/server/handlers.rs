use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::queue::QueueManager;
use crate::system::{
    create_folder as sys_create_folder, list_directories as sys_list_directories,
    resolve_folder_candidate, scan_folder_for_videos,
};

#[derive(Clone)]
pub struct AppState {
    pub queue: QueueManager,
}

#[derive(Debug, Deserialize)]
pub struct PathQuery {
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ScanFolderRequest {
    #[serde(rename = "folderPath")]
    pub folder_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFolderRequest {
    #[serde(rename = "folderPath")]
    pub folder_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveFolderRequest {
    #[serde(rename = "folderName")]
    pub folder_name: Option<String>,
    #[serde(rename = "sampleFile")]
    pub sample_file: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveQueueRequest {
    pub file: Option<String>,
}

pub async fn get_status(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let in_prog = state.queue.active_item.lock().unwrap().is_some();
    let active = state.queue.active_item.lock().unwrap().clone();
    let current_prog = state.queue.current_progress.lock().unwrap().clone();

    Json(json!({
        "success": true,
        "status": "online",
        "service": "star",
        "port": 4200,
        "consumptionInProgress": in_prog,
        "activeItem": active,
        "currentProgress": current_prog,
        "processingWindows": 0
    }))
}

pub async fn list_queue(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items = state.queue.get_queue_items();
    Json(json!({
        "success": true,
        "detail": {
            "type": "queue",
            "subtype": "list",
            "items": items
        }
    }))
}

pub async fn list_detailed_queue(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let detailed = state.queue.get_detailed_queue_items();
    Json(json!({
        "success": true,
        "detail": {
            "type": "queue",
            "subtype": "detailed",
            "items": detailed.items,
            "inProgress": detailed.in_progress,
            "activeItem": detailed.active_item,
            "currentProgress": detailed.current_progress
        }
    }))
}

pub async fn cancel_active_job(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let cancelled = state.queue.cancel_active_job();
    Json(json!({
        "success": cancelled,
        "detail": {
            "type": "queue/cancel-active",
            "cancelled": cancelled
        }
    }))
}

pub async fn remove_from_queue(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RemoveQueueRequest>,
) -> impl IntoResponse {
    let file = match body.file {
        Some(f) if !f.trim().is_empty() => f,
        _ => {
            return Json(json!({
                "success": false,
                "detail": {
                    "type": "queue/remove",
                    "error": "No file was provided in message body"
                }
            }));
        }
    };

    let removed = state.queue.remove_from_queue(&file).unwrap_or(false);
    Json(json!({
        "success": removed,
        "detail": {
            "type": "queue/remove",
            "removed": removed
        }
    }))
}

pub async fn add_to_queue(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let output_folder = body.get("outputFolder").and_then(|v| v.as_str());

    if let Some(items) = body.get("items").and_then(|v| v.as_array()) {
        let mut added = Vec::new();
        for item in items {
            let file_opt = if let Some(s) = item.as_str() {
                Some(s.to_string())
            } else {
                item.get("file").and_then(|f| f.as_str()).map(|f| f.to_string())
            };

            if let Some(file) = file_opt {
                let crop = item.get("crop");
                let item_folder = item
                    .get("outputFolder")
                    .and_then(|f| f.as_str())
                    .or(output_folder);
                let pos = state.queue.add_to_queue(&file, crop, item_folder).unwrap_or(-1);
                added.push(json!({ "file": file, "position": pos }));
            }
        }

        return Json(json!({
            "success": true,
            "detail": {
                "type": "queue/add-multiple",
                "count": added.len(),
                "items": added
            }
        }));
    }

    if let Some(files) = body.get("files").and_then(|v| v.as_array()) {
        let mut added = Vec::new();
        for f in files {
            if let Some(file_str) = f.as_str() {
                let pos = state.queue.add_to_queue(file_str, None, output_folder).unwrap_or(-1);
                added.push(json!({ "file": file_str, "position": pos }));
            }
        }

        return Json(json!({
            "success": true,
            "detail": {
                "type": "queue/add-multiple",
                "count": added.len(),
                "items": added
            }
        }));
    }

    if let Some(file) = body.get("file").and_then(|v| v.as_str()) {
        let crop = body.get("crop");
        let pos = state.queue.add_to_queue(file, crop, output_folder).unwrap_or(-1);
        return Json(json!({
            "success": true,
            "detail": {
                "type": "queue/add",
                "position": pos
            }
        }));
    }

    Json(json!({
        "success": false,
        "detail": {
            "type": "queue/add",
            "error": "Nenhum arquivo informado no corpo da requisição"
        }
    }))
}

pub async fn scan_folder(
    Json(body): Json<ScanFolderRequest>,
) -> impl IntoResponse {
    let folder = match body.folder_path {
        Some(f) if !f.trim().is_empty() => f,
        _ => {
            return Json(json!({
                "success": false,
                "error": "Diretório não informado"
            }));
        }
    };

    match scan_folder_for_videos(&folder) {
        Ok(files) => Json(json!({
            "success": true,
            "count": files.len(),
            "files": files
        })),
        Err(e) => Json(json!({
            "success": false,
            "error": e
        })),
    }
}

pub async fn list_directories(Query(query): Query<PathQuery>) -> impl IntoResponse {
    let listing = sys_list_directories(query.path.as_deref());
    Json(json!(listing))
}

pub async fn create_folder(
    Json(body): Json<CreateFolderRequest>,
) -> impl IntoResponse {
    let path = match body.folder_path {
        Some(p) if !p.trim().is_empty() => p,
        _ => return Json(json!({ "success": false, "error": "Caminho não fornecido" })),
    };

    match sys_create_folder(&path) {
        Ok(created) => Json(json!({ "success": true, "path": created })),
        Err(e) => Json(json!({ "success": false, "error": e })),
    }
}

pub async fn resolve_folder(
    Json(body): Json<ResolveFolderRequest>,
) -> impl IntoResponse {
    let name = match body.folder_name {
        Some(n) if !n.trim().is_empty() => n,
        _ => return Json(json!({ "success": false, "error": "Nome da pasta não fornecido" })),
    };

    let resolved = resolve_folder_candidate(&name, body.sample_file.as_deref());
    let path_str = resolved
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::download_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(&name)
                .to_string_lossy()
                .to_string()
        });

    Json(json!({ "success": true, "path": path_str }))
}

pub async fn sonarr_webhook(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    handle_arr_webhook(&state, &body, "Sonarr")
}

pub async fn radarr_webhook(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    handle_arr_webhook(&state, &body, "Radarr")
}

fn handle_arr_webhook(state: &AppState, event: &Value, program: &str) -> Json<Value> {
    let event_type = event.get("eventType").and_then(|v| v.as_str()).unwrap_or("");

    match event_type {
        "Download" => {
            let is_sonarr = event.get("series").is_some() && event.get("episodeFile").is_some();
            let is_radarr = event.get("movie").is_some() && event.get("movieFile").is_some();

            if !is_sonarr && !is_radarr {
                return Json(json!({
                    "success": false,
                    "detail": {
                        "type": "webhook/arr/add",
                        "error": "No file path provided in event"
                    }
                }));
            }

            let add_path = if is_sonarr {
                let series_path = event["series"]["path"].as_str().unwrap_or("");
                let rel = event["episodeFile"]["relativePath"].as_str().unwrap_or("");
                Path::new(series_path).join(rel).to_string_lossy().to_string()
            } else {
                let movie_folder = event["movie"]["folderPath"].as_str().unwrap_or("");
                let rel = event["movieFile"]["relativePath"].as_str().unwrap_or("");
                Path::new(movie_folder).join(rel).to_string_lossy().to_string()
            };

            let pos = state.queue.add_to_queue(&add_path, None, None).unwrap_or(-1);
            Json(json!({
                "success": true,
                "detail": {
                    "type": "webhook/arr/add",
                    "position": pos
                }
            }))
        }
        "MovieFileDelete" | "EpisodeFileDelete" => {
            let delete_path = event["episodeFile"]["path"]
                .as_str()
                .or_else(|| event["movieFile"]["path"].as_str());

            if let Some(p) = delete_path {
                let removed = state.queue.remove_from_queue(p).unwrap_or(false);
                Json(json!({
                    "success": true,
                    "detail": {
                        "type": "webhook/arr/remove",
                        "position": if removed { 0 } else { -1 }
                    }
                }))
            } else {
                Json(json!({
                    "success": false,
                    "detail": {
                        "type": "webhook/arr/remove",
                        "error": "No file path provided in event"
                    }
                }))
            }
        }
        "Test" => Json(json!({
            "success": true,
            "detail": {
                "type": "test",
                "program": program
            }
        })),
        _ => Json(json!({
            "success": false,
            "detail": {
                "type": "event",
                "subtype": event_type,
                "error": format!("Non-relevant {} event received: {}", program, event_type)
            }
        })),
    }
}
