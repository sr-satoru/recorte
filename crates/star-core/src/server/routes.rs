use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use super::handlers::*;

pub fn create_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
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
        .route("/api/1/webhook/sonarr", post(sonarr_webhook))
        .route("/api/1/webhook/radarr", post(radarr_webhook))
        .layer(cors)
        .with_state(state)
}

pub async fn start_http_server(port: u16, state: Arc<AppState>) -> Result<(), String> {
    let app = create_router(state);
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Falha ao abrir porta {}: {}", port, e))?;

    println!("[Star Core] Servidor HTTP ativo na porta {}", port);

    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Erro no servidor HTTP: {}", e))
}
