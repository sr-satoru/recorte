use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shortcut {
    pub name: String,
    pub path: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub success: bool,
    pub current: String,
    pub parent: String,
    pub directories: Vec<String>,
    pub shortcuts: Vec<Shortcut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

const VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "flv", "wmv", "mpg", "mpeg",
];

pub fn scan_folder_for_videos(folder_path: &str) -> Result<Vec<String>, String> {
    let root = Path::new(folder_path);
    if !root.exists() {
        return Err(format!("Diretório não encontrado: {}", folder_path));
    }

    let mut found = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules"
        })
    {
        if let Ok(entry) = entry {
            if entry.file_type().is_file() {
                if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                    let ext_lower = ext.to_ascii_lowercase();
                    if VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
                        found.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Ok(found)
}

pub fn list_directories(requested_path: Option<&str>) -> DirectoryListing {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let target = match requested_path {
        Some(p) if !p.trim().is_empty() => {
            let pb = PathBuf::from(p);
            if pb.exists() && pb.is_dir() {
                pb
            } else {
                home.clone()
            }
        }
        _ => home.clone(),
    };

    let parent = target
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| target.to_string_lossy().to_string());

    let mut dirs_list = Vec::new();
    if let Ok(read_dir) = fs::read_dir(&target) {
        for entry in read_dir.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') {
                        dirs_list.push(name);
                    }
                }
            }
        }
    }
    dirs_list.sort();

    let mut shortcuts = Vec::new();
    shortcuts.push(Shortcut {
        name: "Início".to_string(),
        path: home.to_string_lossy().to_string(),
        icon: "🏠".to_string(),
    });

    if let Some(dl) = dirs::download_dir() {
        if dl.exists() {
            shortcuts.push(Shortcut {
                name: "Downloads".to_string(),
                path: dl.to_string_lossy().to_string(),
                icon: "📥".to_string(),
            });
        }
    }

    if let Some(vid) = dirs::video_dir() {
        if vid.exists() {
            shortcuts.push(Shortcut {
                name: "Vídeos".to_string(),
                path: vid.to_string_lossy().to_string(),
                icon: "🎬".to_string(),
            });
        }
    }

    if let Some(desk) = dirs::desktop_dir() {
        if desk.exists() {
            shortcuts.push(Shortcut {
                name: "Área de Trabalho".to_string(),
                path: desk.to_string_lossy().to_string(),
                icon: "🖥️".to_string(),
            });
        }
    }

    DirectoryListing {
        success: true,
        current: target.to_string_lossy().to_string(),
        parent,
        directories: dirs_list,
        shortcuts,
        error: None,
    }
}

pub fn create_folder(folder_path: &str) -> Result<String, String> {
    fs::create_dir_all(folder_path).map_err(|e| format!("Erro ao criar pasta: {}", e))?;
    Ok(folder_path.to_string())
}

pub fn resolve_folder_candidate(folder_name: &str, sample_file: Option<&str>) -> Option<PathBuf> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let mut search_dirs = Vec::new();
    if let Some(dl) = dirs::download_dir() {
        search_dirs.push(dl);
    }
    if let Some(vid) = dirs::video_dir() {
        search_dirs.push(vid);
    }
    if let Some(desk) = dirs::desktop_dir() {
        search_dirs.push(desk);
    }
    search_dirs.push(home.clone());

    for root in &search_dirs {
        let direct = root.join(folder_name);
        if direct.exists() && direct.is_dir() {
            return Some(direct);
        }
    }

    if let Some(sample) = sample_file {
        for root in &search_dirs {
            for entry in WalkDir::new(root).max_depth(4).into_iter().flatten() {
                if entry.file_type().is_file() && entry.file_name().to_string_lossy() == sample {
                    if let Some(p) = entry.path().parent() {
                        return Some(p.to_path_buf());
                    }
                }
            }
        }
    }

    search_dirs.first().map(|d| d.join(folder_name))
}

pub fn resolve_video_path(file_path: &str, fallback_folder: Option<&str>) -> PathBuf {
    let p = Path::new(file_path);
    if p.exists() {
        return p.to_path_buf();
    }

    if let Some(fb) = fallback_folder {
        let c1 = Path::new(fb).join(file_path);
        if c1.exists() {
            return c1;
        }
        if let Some(fname) = p.file_name() {
            let c2 = Path::new(fb).join(fname);
            if c2.exists() {
                return c2;
            }
        }
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let mut common_roots = vec![home.clone()];
    if let Some(dl) = dirs::download_dir() {
        common_roots.push(dl);
    }
    if let Some(vid) = dirs::video_dir() {
        common_roots.push(vid);
    }
    if let Some(desk) = dirs::desktop_dir() {
        common_roots.push(desk);
    }

    if let Some(fname) = p.file_name() {
        for root in &common_roots {
            let c = root.join(fname);
            if c.exists() {
                return c;
            }
        }

        for root in &common_roots {
            for entry in WalkDir::new(root).max_depth(3).into_iter().flatten() {
                if entry.file_name() == fname && entry.path().exists() {
                    return entry.path().to_path_buf();
                }
            }
        }
    }

    p.to_path_buf()
}
