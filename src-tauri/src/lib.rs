use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

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

      // Start Node sidecar in background
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        let resource_dir = app_handle.path().resource_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let main_js = resource_dir.join("src").join("main.js");

        let args = if main_js.exists() {
          vec![main_js.to_string_lossy().to_string(), "serve".to_string()]
        } else {
          vec!["src/main.js".to_string(), "serve".to_string()]
        };

        if let Ok(sidecar_command) = app_handle.shell().sidecar("star-engine") {
          let cmd = sidecar_command.args(args);
          if let Ok((mut rx, _child)) = cmd.spawn() {
            while let Some(event) = rx.recv().await {
              match event {
                CommandEvent::Stdout(line) => {
                  println!("[star-engine]: {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                  eprintln!("[star-engine]: {}", String::from_utf8_lossy(&line));
                }
                _ => {}
              }
            }
          }
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
