use axum::routing::{get, post};
use axum::Router;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use super::handlers::*;

pub fn create_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let mut router = Router::new()
        .route("/api/1/status", get(get_status))
        .route("/api/1/queue", get(list_queue))
        .route("/api/1/queue/detailed", get(list_detailed_queue))
        .route("/api/1/queue/add", post(add_to_queue))
        .route("/api/1/queue/remove", post(remove_from_queue))
        .route("/api/1/queue/cancel-active", post(cancel_active_job))
        .route("/api/1/folder/scan", post(scan_folder))
        .route("/api/1/system/directories", get(list_directories))
        .route("/api/1/system/resolve-folder", post(resolve_folder))
        .route("/api/1/system/create-folder", post(create_folder))
        .route("/api/1/system/ffmpeg-status", get(get_ffmpeg_status))
        .route("/api/1/system/ffmpeg-download", post(trigger_ffmpeg_download))
        .route("/api/1/webhook/sonarr", post(sonarr_webhook))
        .route("/api/1/webhook/radarr", post(radarr_webhook));

    // Serve built React Web UI if dist directory exists
    let dist_candidates = [
        PathBuf::from("frontend/dist"),
        PathBuf::from("../frontend/dist"),
        PathBuf::from("../../frontend/dist"),
        PathBuf::from("dist"),
    ];

    if let Some(dist_path) = dist_candidates.into_iter().find(|p| p.exists() && p.is_dir()) {
        let index_file = dist_path.join("index.html");
        if index_file.exists() {
            println!("[Star Core] Servindo frontend web de: {}", dist_path.display());
            let serve_service = ServeDir::new(&dist_path).fallback(ServeFile::new(index_file));
            router = router.fallback_service(serve_service);
        }
    }

    router.layer(cors).with_state(state)
}

pub async fn start_http_server(port: u16, state: Arc<AppState>) -> Result<(), String> {
    let app = create_router(state);
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Falha ao abrir porta {}: {}", port, e))?;

    println!("[Star Core] Servidor HTTP ativo em http://localhost:{}", port);

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Erro no servidor HTTP: {}", e))
}
