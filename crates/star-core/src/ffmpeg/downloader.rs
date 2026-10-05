use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

pub static IS_DOWNLOADING_FFMPEG: AtomicBool = AtomicBool::new(false);
pub static DOWNLOAD_PROGRESS_BYTES: AtomicU64 = AtomicU64::new(0);
pub static DOWNLOAD_TOTAL_BYTES: AtomicU64 = AtomicU64::new(0);

pub fn get_app_bin_dir() -> PathBuf {
    let base_dir = dirs::data_local_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("com.star.desktop");
    base_dir.join("bin")
}

pub fn get_app_ffmpeg_paths() -> (PathBuf, PathBuf) {
    let bin_dir = get_app_bin_dir();
    #[cfg(windows)]
    {
        (bin_dir.join("ffmpeg.exe"), bin_dir.join("ffprobe.exe"))
    }
    #[cfg(not(windows))]
    {
        (bin_dir.join("ffmpeg"), bin_dir.join("ffprobe"))
    }
}

pub fn is_app_ffmpeg_ready() -> bool {
    let (ffmpeg_path, ffprobe_path) = get_app_ffmpeg_paths();
    if !ffmpeg_path.is_file() || !ffprobe_path.is_file() {
        return false;
    }
    let m1 = ffmpeg_path.metadata().map(|m| m.len()).unwrap_or(0);
    let m2 = ffprobe_path.metadata().map(|m| m.len()).unwrap_or(0);
    // Real FFmpeg/FFprobe binaries are at least 1MB
    m1 > 1024 * 1024 && m2 > 1024 * 1024
}

pub async fn ensure_app_ffmpeg() -> Result<PathBuf, String> {
    let bin_dir = get_app_bin_dir();
    if is_app_ffmpeg_ready() {
        return Ok(bin_dir);
    }

    if IS_DOWNLOADING_FFMPEG.swap(true, Ordering::SeqCst) {
        // Already downloading in another task, wait a bit
        for _ in 0..120 {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            if is_app_ffmpeg_ready() {
                return Ok(bin_dir);
            }
        }
        return Err("Download do FFmpeg em andamento por outra tarefa".to_string());
    }

    let result = download_and_install_ffmpeg(&bin_dir).await;
    IS_DOWNLOADING_FFMPEG.store(false, Ordering::SeqCst);
    result.map(|_| bin_dir)
}

#[allow(dead_code)]
async fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    println!("[Star Engine] Baixando FFmpeg de: {}", url);
    DOWNLOAD_PROGRESS_BYTES.store(0, Ordering::SeqCst);
    DOWNLOAD_TOTAL_BYTES.store(0, Ordering::SeqCst);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Erro no cliente HTTP: {}", e))?;

    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Falha ao conectar para download do FFmpeg: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download falhou com status HTTP {}", response.status()));
    }

    if let Some(len) = response.content_length() {
        DOWNLOAD_TOTAL_BYTES.store(len, Ordering::SeqCst);
    }

    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut file = File::create(dest).map_err(|e| format!("Erro ao criar arquivo temporário: {}", e))?;
    let mut downloaded = 0u64;

    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Erro durante o download dos dados: {}", e))? {
        file.write_all(&chunk).map_err(|e| format!("Erro ao escrever dados no disco: {}", e))?;
        downloaded += chunk.len() as u64;
        DOWNLOAD_PROGRESS_BYTES.store(downloaded, Ordering::SeqCst);
    }

    file.flush().map_err(|e| format!("Erro ao sincronizar arquivo com o disco: {}", e))?;
    println!("[Star Engine] Download concluído ({:.1} MB)", downloaded as f64 / 1_048_576.0);
    Ok(())
}

async fn download_and_install_ffmpeg(bin_dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = bin_dir;
        return Err("Instalação automática para macOS não configurada. Use homebrew: brew install ffmpeg".to_string());
    }

    #[cfg(not(target_os = "macos"))]
    {
        fs::create_dir_all(bin_dir).map_err(|e| format!("Erro ao criar pasta bin do app: {}", e))?;

        let temp_dir = tempfile::tempdir().map_err(|e| format!("Erro ao criar pasta temp: {}", e))?;

        #[cfg(windows)]
        {
            let zip_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
            let zip_path = temp_dir.path().join("ffmpeg.zip");

            download_file(zip_url, &zip_path).await?;

            println!("[Star Engine] Descompactando binários do Windows...");
            extract_windows_zip(&zip_path, bin_dir)?;
        }

        #[cfg(target_os = "linux")]
        {
            let tar_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz";
            let tar_path = temp_dir.path().join("ffmpeg.tar.xz");

            download_file(tar_url, &tar_path).await?;

            println!("[Star Engine] Descompactando binários do Linux...");
            extract_linux_tar(&tar_path, temp_dir.path(), bin_dir).await?;
        }

        if is_app_ffmpeg_ready() {
            println!("[Star Engine] FFmpeg e FFprobe prontos e isolados na pasta: {}", bin_dir.display());
            Ok(())
        } else {
            Err("Os binários do FFmpeg não puderam ser verificados após a extração".to_string())
        }
    }
}

#[cfg(windows)]
fn extract_windows_zip(zip_path: &Path, bin_dir: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| format!("Erro ao abrir zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Erro ao ler zip: {}", e))?;

    let mut found_ffmpeg = false;
    let mut found_ffprobe = false;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Erro no arquivo zip: {}", e))?;
        let name = file.name().to_string();

        if name.ends_with("ffmpeg.exe") {
            let dest = bin_dir.join("ffmpeg.exe");
            let _ = fs::remove_file(&dest);
            let mut outfile = File::create(&dest).map_err(|e| format!("Erro ao criar ffmpeg.exe: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Erro ao extrair ffmpeg.exe: {}", e))?;
            found_ffmpeg = true;
        } else if name.ends_with("ffprobe.exe") {
            let dest = bin_dir.join("ffprobe.exe");
            let _ = fs::remove_file(&dest);
            let mut outfile = File::create(&dest).map_err(|e| format!("Erro ao criar ffprobe.exe: {}", e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Erro ao extrair ffprobe.exe: {}", e))?;
            found_ffprobe = true;
        }
    }

    if found_ffmpeg && found_ffprobe {
        Ok(())
    } else {
        Err("ffmpeg.exe ou ffprobe.exe não encontrados dentro do arquivo ZIP".to_string())
    }
}

#[cfg(target_os = "linux")]
async fn extract_linux_tar(tar_path: &Path, extract_tmp: &Path, bin_dir: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    // Use system tar command to unpack tar.xz cleanly
    let status = tokio::process::Command::new("tar")
        .args([
            "-xf",
            tar_path.to_str().unwrap(),
            "-C",
            extract_tmp.to_str().unwrap(),
        ])
        .status()
        .await
        .map_err(|e| format!("Falha ao executar comando tar: {}", e))?;

    if !status.success() {
        return Err(format!("Comando tar encerrou com erro: {:?}", status.code()));
    }

    let mut found_ffmpeg = false;
    let mut found_ffprobe = false;

    for entry in walkdir::WalkDir::new(extract_tmp).into_iter().flatten() {
        let name = entry.file_name().to_string_lossy();
        if entry.file_type().is_file() {
            if name == "ffmpeg" {
                let dest = bin_dir.join("ffmpeg");
                let _ = fs::remove_file(&dest);
                fs::copy(entry.path(), &dest).map_err(|e| format!("Erro ao copiar ffmpeg: {}", e))?;
                fs::set_permissions(&dest, fs::Permissions::from_mode(0o755)).map_err(|e| format!("Erro ao definir chmod: {}", e))?;
                found_ffmpeg = true;
            } else if name == "ffprobe" {
                let dest = bin_dir.join("ffprobe");
                let _ = fs::remove_file(&dest);
                fs::copy(entry.path(), &dest).map_err(|e| format!("Erro ao copiar ffprobe: {}", e))?;
                fs::set_permissions(&dest, fs::Permissions::from_mode(0o755)).map_err(|e| format!("Erro ao definir chmod: {}", e))?;
                found_ffprobe = true;
            }
        }
    }

    if found_ffmpeg && found_ffprobe {
        Ok(())
    } else {
        Err("ffmpeg ou ffprobe não encontrados dentro do pacote descompactado".to_string())
    }
}
