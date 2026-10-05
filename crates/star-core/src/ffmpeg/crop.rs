use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::broadcast;

use super::detect::{get_duration, get_reported_dimensions, resolve_binary};

pub const DEFAULT_FFMPEG_CROP_TEMPLATE: &str =
    "-y -i <input_file> -map_metadata 0 -map 0 -crf 17 -vf crop=<x>:<y>:<xo>:<yo> -c:a copy -c:s copy <output_file>";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressUpdate {
    pub path: String,
    pub percentage: f64,
    pub time: String,
    pub speed: String,
    pub fps: String,
    pub started_at: u64,
}

pub struct CropJobOptions {
    pub ffmpeg_root: Option<String>,
    pub ffmpeg_options: Option<String>,
    pub crop: [u32; 4], // [x, y, x_offset, y_offset]
    pub metadata: bool,
    pub duration: f64,
}

pub async fn detect_codec_name(
    input_file: &str,
    ffmpeg_root: Option<&str>,
) -> Result<String, String> {
    let ffprobe_bin = resolve_binary("ffprobe", ffmpeg_root);
    let output = Command::new(&ffprobe_bin)
        .args([
            "-hide_banner",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            input_file,
        ])
        .output()
        .await
        .map_err(|e| format!("Falha ao detectar codec: {}", e))?;

    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Erro ao decodificar JSON do ffprobe: {}", e))?;

    let codec = parsed
        .get("streams")
        .and_then(|s| s.as_array())
        .and_then(|streams| {
            streams.iter().find_map(|s| {
                if s.get("codec_type")?.as_str()? == "video" {
                    s.get("codec_name")?.as_str().map(|str_val| str_val.to_string())
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();

    Ok(codec)
}

fn parse_crop_args(
    template: &str,
    input_file: &str,
    output_file: &str,
    crop: [u32; 4],
) -> Vec<String> {
    let [x, y, xo, yo] = crop;
    template
        .split_whitespace()
        .map(|token| {
            token
                .replace("<input_file>", input_file)
                .replace("<output_file>", output_file)
                .replace("<x>", &x.to_string())
                .replace("<y>", &y.to_string())
                .replace("<xo>", &xo.to_string())
                .replace("<yo>", &yo.to_string())
        })
        .collect()
}

pub async fn crop_video(
    input_file: &str,
    output_file: &str,
    options: CropJobOptions,
    is_cancelled: Arc<AtomicBool>,
    progress_target: Arc<Mutex<Option<ProgressUpdate>>>,
    progress_tx: Option<broadcast::Sender<ProgressUpdate>>,
) -> Result<(), String> {
    let is_in_place = output_file == "in-place";
    let actual_output: PathBuf = if is_in_place {
        let ext = Path::new(input_file)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("mkv");
        let parent = Path::new(input_file).parent().unwrap_or_else(|| Path::new("."));
        parent.join(format!(
            ".star_tmp_{}_{}.{}",
            std::process::id(),
            chrono::Utc::now().timestamp_millis(),
            ext
        ))
    } else {
        PathBuf::from(output_file)
    };

    let duration = if options.duration > 0.0 {
        options.duration
    } else {
        get_duration(input_file, options.ffmpeg_root.as_deref())
            .await
            .unwrap_or(0.0)
    };

    println!("[Star Engine] Duração detectada para {}: {:.2}s", input_file, duration);

    let started_at = chrono::Utc::now().timestamp_millis() as u64;
    let ffmpeg_bin = resolve_binary("ffmpeg", options.ffmpeg_root.as_deref());

    let crop_result = if options.metadata {
        let codec = detect_codec_name(input_file, options.ffmpeg_root.as_deref()).await?;
        if codec != "h264" && codec != "hevc" {
            return Err(format!("Corte baseado em metadata não suportado para codec: {}", codec));
        }

        let (file_w, file_h) = get_reported_dimensions(input_file, options.ffmpeg_root.as_deref()).await?;
        let [x, y, x_offset, y_offset] = options.crop;
        let left = x_offset;
        let right = file_w.saturating_sub(x).saturating_sub(x_offset);
        let top = y_offset;
        let bottom = file_h.saturating_sub(y).saturating_sub(y_offset);

        let bsf_arg = format!(
            "{}_metadata=crop_left={}:crop_right={}:crop_top={}:crop_bottom={}",
            codec, left, right, top, bottom
        );

        let mut cmd = Command::new(&ffmpeg_bin);
        cmd.args([
            "-y",
            "-i",
            input_file,
            "-codec",
            "copy",
            "-bsf:v",
            &bsf_arg,
            "-progress",
            "pipe:2",
            actual_output.to_str().unwrap(),
        ]);
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::piped());

        run_command_with_progress(
            cmd,
            input_file,
            duration,
            started_at,
            is_cancelled.clone(),
            progress_target.clone(),
            progress_tx.clone(),
        )
        .await
    } else {
        let template = options
            .ffmpeg_options
            .unwrap_or_else(|| DEFAULT_FFMPEG_CROP_TEMPLATE.to_string());
        let mut args = parse_crop_args(&template, input_file, actual_output.to_str().unwrap(), options.crop);

        // Add -progress pipe:2 if not already in args
        if !args.iter().any(|a| a == "-progress") {
            args.insert(0, "-progress".to_string());
            args.insert(1, "pipe:2".to_string());
        }

        let mut cmd = Command::new(&ffmpeg_bin);
        cmd.args(&args);
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::piped());

        run_command_with_progress(
            cmd,
            input_file,
            duration,
            started_at,
            is_cancelled.clone(),
            progress_target.clone(),
            progress_tx.clone(),
        )
        .await
    };

    if let Err(e) = crop_result {
        if actual_output.exists() {
            let _ = tokio::fs::remove_file(&actual_output).await;
        }
        return Err(e);
    }

    if is_in_place {
        if actual_output.exists() {
            tokio::fs::rename(&actual_output, input_file)
                .await
                .map_err(|e| format!("Falha ao substituir arquivo original: {}", e))?;
        }
    }

    Ok(())
}

async fn run_command_with_progress(
    mut cmd: Command,
    input_file: &str,
    duration: f64,
    started_at: u64,
    is_cancelled: Arc<AtomicBool>,
    progress_target: Arc<Mutex<Option<ProgressUpdate>>>,
    progress_tx: Option<broadcast::Sender<ProgressUpdate>>,
) -> Result<(), String> {
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Falha ao iniciar processo do ffmpeg: {}", e))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Não foi possível conectar ao stderr do ffmpeg".to_string())?;

    let time_regex = Regex::new(r"time=([0-9:.]+)").unwrap();
    let out_time_regex = Regex::new(r"out_time=([0-9:.]+)").unwrap();
    let speed_regex = Regex::new(r"speed=\s*([0-9.]+x)").unwrap();
    let fps_regex = Regex::new(r"fps=\s*([0-9.]+)").unwrap();

    let mut current_speed = "1x".to_string();
    let mut current_fps = "0".to_string();

    let mut chunk = [0u8; 1024];
    let mut line_buffer = Vec::with_capacity(2048);

    loop {
        if is_cancelled.load(Ordering::Relaxed) {
            let _ = child.kill().await;
            return Err("Processamento cancelado pelo usuário".to_string());
        }

        tokio::select! {
            n_res = stderr.read(&mut chunk) => {
                match n_res {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        for &byte in &chunk[..n] {
                            // Split on carriage return '\r' or newline '\n'
                            if byte == b'\r' || byte == b'\n' {
                                if !line_buffer.is_empty() {
                                    let line = String::from_utf8_lossy(&line_buffer);

                                    if line.contains("Conversion failed!") {
                                        let _ = child.kill().await;
                                        return Err(format!("FFmpeg erro de conversão: {}", line));
                                    }

                                    if let Some(c) = speed_regex.captures(&line) {
                                        current_speed = c[1].to_string();
                                    }
                                    if let Some(c) = fps_regex.captures(&line) {
                                        current_fps = c[1].to_string();
                                    }

                                    let time_match = time_regex.captures(&line)
                                        .or_else(|| out_time_regex.captures(&line));

                                    if let Some(caps) = time_match {
                                        let time_str = caps[1].to_string();
                                        if time_str != "N/A" {
                                            let parts: Vec<&str> = time_str.split(':').collect();
                                            let mut secs = 0.0;
                                            if parts.len() == 3 {
                                                let h = parts[0].parse::<f64>().unwrap_or(0.0);
                                                let m = parts[1].parse::<f64>().unwrap_or(0.0);
                                                let s = parts[2].parse::<f64>().unwrap_or(0.0);
                                                secs = h * 3600.0 + m * 60.0 + s;
                                            }

                                            let percentage = if duration > 0.0 {
                                                ((secs / duration) * 100.0).clamp(0.1, 99.9)
                                            } else {
                                                0.0
                                            };

                                            let rounded_pct = (percentage * 10.0).round() / 10.0;

                                            let update = ProgressUpdate {
                                                path: input_file.to_string(),
                                                percentage: rounded_pct,
                                                time: time_str,
                                                speed: current_speed.clone(),
                                                fps: current_fps.clone(),
                                                started_at,
                                            };

                                            // Directly update in memory
                                            *progress_target.lock().unwrap() = Some(update.clone());

                                            if let Some(ref tx) = progress_tx {
                                                let _ = tx.send(update);
                                            }
                                        }
                                    }

                                    line_buffer.clear();
                                }
                            } else {
                                line_buffer.push(byte);
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            status = child.wait() => {
                match status {
                    Ok(exit_status) => {
                        if exit_status.success() {
                            return Ok(());
                        } else {
                            return Err(format!("FFmpeg encerrou com código de erro: {:?}", exit_status.code()));
                        }
                    }
                    Err(e) => return Err(format!("Erro ao esperar pelo ffmpeg: {}", e)),
                }
            }
        }
    }

    let final_status = child.wait().await.map_err(|e| e.to_string())?;
    if final_status.success() {
        Ok(())
    } else {
        Err(format!("FFmpeg finalizou com erro: {:?}", final_status.code()))
    }
}
