use tauri::Manager;

#[tauri::command]
async fn detect_video_dimensions(file: String) -> Result<star_core::DetectedDimensions, String> {
    star_core::detect_dimensions(&file, None).await
}

#[tauri::command]
fn scan_folder(folder: String) -> Result<Vec<String>, String> {
    star_core::scan_folder_for_videos(&folder)
}

#[tauri::command]
fn list_dirs(path: Option<String>) -> star_core::DirectoryListing {
    star_core::list_directories(path.as_deref())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                let _ = app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                );
            }

            // Resolve safe, writable AppData directory for the database
            let app_data = app.path().app_data_dir().unwrap_or_else(|_| {
                dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("com.star.desktop")
            });
            let db_path = app_data.join("queue.db");

            let config = star_core::EngineConfig {
                db_path,
                http_port: 4200,
                ffmpeg_root: None,
                ffmpeg_options: None,
                default_output_folder: None,
                path_mappings: None,
            };

            // Start native Star Engine (Queue worker + Axum REST API / Webhooks)
            tauri::async_runtime::spawn(async move {
                println!("[Star Desktop] Iniciando Star Engine nativo em background...");
                if let Err(e) = star_core::start_engine(config).await {
                    eprintln!("[Star Desktop] Erro ao iniciar Star Engine: {}", e);
                } else {
                    println!("[Star Desktop] Star Engine nativo iniciado com sucesso na porta 4200.");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_video_dimensions,
            scan_folder,
            list_dirs
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
