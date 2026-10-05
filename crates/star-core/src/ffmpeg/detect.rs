use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedDimensions {
    pub file_width: u32,
    pub file_height: u32,
    pub actual_width: u32,
    pub actual_height: u32,
    pub left_offset: u32,
    pub top_offset: u32,
    pub aspect: String,
    pub duration: f64,
}

const KNOWN_RATIOS: &[(&str, f64)] = &[
    ("16:9 (hdtv)", 16.0 / 9.0),
    ("9:16 (vertical)", 9.0 / 16.0),
    ("4:3 (sdtv)", 4.0 / 3.0),
    ("3:4 (vertical)", 3.0 / 4.0),
    ("4:5 (vertical)", 4.0 / 5.0),
    ("5:4", 5.0 / 4.0),
    ("16:10 (golden ratio)", 16.0 / 10.0),
    ("10:16 (vertical)", 10.0 / 16.0),
    ("1.85:1 (cinema)", 1.85),
    ("2.21:1 (widescreen)", 2.21),
    ("2.35:1 (anamorphic)", 2.35),
    ("2.39:1 (anamorphic)", 2.39),
    ("2:1", 2.0),
    ("1:2 (tall)", 1.0 / 2.0),
    ("5:3", 5.0 / 3.0),
    ("3:5 (vertical)", 3.0 / 5.0),
    ("1:1 (square)", 1.0),
];

pub fn resolve_binary(bin: &str, custom_path: Option<&str>) -> PathBuf {
    // 1. Custom path provided explicitly (e.g. CLI flag)
    if let Some(custom) = custom_path {
        if !custom.trim().is_empty() {
            let p = Path::new(custom);
            if p.is_dir() {
                #[cfg(windows)]
                let bin_name = format!("{}.exe", bin);
                #[cfg(not(windows))]
                let bin_name = bin.to_string();

                let candidate = p.join(&bin_name);
                if candidate.exists() {
                    return candidate;
                }
            } else if p.exists() {
                return p.to_path_buf();
            }
        }
    }

    // 2. Dedicated app bin folder (independent from system PATH)
    let app_bin_dir = super::downloader::get_app_bin_dir();
    #[cfg(windows)]
    let app_candidate = app_bin_dir.join(format!("{}.exe", bin));
    #[cfg(not(windows))]
    let app_candidate = app_bin_dir.join(bin);

    if app_candidate.exists() && app_candidate.metadata().map(|m| m.len() > 1024 * 1024).unwrap_or(false) {
        return app_candidate;
    }

    // 3. Fallback to system PATH
    PathBuf::from(bin)
}

pub async fn get_reported_dimensions(
    file: &str,
    ffmpeg_root: Option<&str>,
) -> Result<(u32, u32), String> {
    let ffprobe_bin = resolve_binary("ffprobe", ffmpeg_root);
    let output = Command::new(&ffprobe_bin)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            file,
        ])
        .output()
        .await
        .map_err(|e| format!("Falha ao executar ffprobe ({}): {}", ffprobe_bin.display(), e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe retornou erro: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Erro ao decodificar JSON do ffprobe: {}", e))?;

    let stream = parsed
        .get("streams")
        .and_then(|s| s.get(0))
        .ok_or_else(|| "Nenhum stream de vídeo encontrado no arquivo".to_string())?;

    let width = stream.get("width").and_then(|w| w.as_u64()).unwrap_or(0) as u32;
    let height = stream.get("height").and_then(|h| h.as_u64()).unwrap_or(0) as u32;

    if width == 0 || height == 0 {
        return Err(format!("Dimensões inválidas lidas do vídeo: {}x{}", width, height));
    }

    Ok((width, height))
}

pub async fn get_duration(file: &str, ffmpeg_root: Option<&str>) -> Result<f64, String> {
    let ffprobe_bin = resolve_binary("ffprobe", ffmpeg_root);

    // 1. Try format=duration directly
    if let Ok(output) = Command::new(&ffprobe_bin)
        .args([
            "-hide_banner",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            file,
        ])
        .output()
        .await
    {
        let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(secs) = out_str.parse::<f64>() {
            if secs > 0.0 {
                return Ok(secs);
            }
        }
    }

    // 2. Try stream=duration (v:0)
    if let Ok(output) = Command::new(&ffprobe_bin)
        .args([
            "-hide_banner",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            file,
        ])
        .output()
        .await
    {
        let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(secs) = out_str.parse::<f64>() {
            if secs > 0.0 {
                return Ok(secs);
            }
        }
    }

    // 3. Fallback: inspect full streams and format JSON
    if let Ok(output) = Command::new(&ffprobe_bin)
        .args([
            "-hide_banner",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=duration",
            "-of",
            "json",
            file,
        ])
        .output()
        .await
    {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
            if let Some(dur_str) = val["format"]["duration"].as_str() {
                if let Ok(secs) = dur_str.parse::<f64>() {
                    if secs > 0.0 {
                        return Ok(secs);
                    }
                }
            }
            if let Some(streams) = val["streams"].as_array() {
                for s in streams {
                    if let Some(dur_str) = s["duration"].as_str() {
                        if let Ok(secs) = dur_str.parse::<f64>() {
                            if secs > 0.0 {
                                return Ok(secs);
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Não foi possível obter a duração do vídeo pelo ffprobe".to_string())
}

fn to_timestamp(seconds: f64) -> String {
    let total_secs = seconds.max(0.0) as u64;
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, secs)
}

async fn probe_crop(
    file: &str,
    timestamp: &str,
    ffmpeg_root: Option<&str>,
) -> Result<String, String> {
    let ffmpeg_bin = resolve_binary("ffmpeg", ffmpeg_root);
    let output = Command::new(&ffmpeg_bin)
        .args([
            "-hide_banner",
            "-ss",
            timestamp,
            "-i",
            file,
            "-to",
            "00:00:05",
            "-vf",
            "cropdetect",
            "-f",
            "null",
            "-",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Falha ao executar cropdetect: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stderr).to_string())
}

fn get_most_common(counts: &HashMap<u32, usize>) -> u32 {
    let mut best_val = 0;
    let mut max_count = 0;
    for (&val, &count) in counts {
        if count > max_count || (count == max_count && val > best_val) {
            max_count = count;
            best_val = val;
        }
    }
    best_val
}

pub async fn detect_dimensions(
    file: &str,
    ffmpeg_root: Option<&str>,
) -> Result<DetectedDimensions, String> {
    let (file_w, file_h) = get_reported_dimensions(file, ffmpeg_root).await?;
    let duration = get_duration(file, ffmpeg_root).await.unwrap_or(0.0);

    let mut actual_w = file_w;
    let mut actual_h = file_h;
    let mut offset_x = 0;
    let mut offset_y = 0;

    if duration > 1.0 {
        let tenth = duration / 10.0;
        let probe_points = [
            tenth,
            tenth * 3.0,
            tenth * 5.0,
            tenth * 7.0,
            tenth * 9.0,
        ];

        let mut x_counts: HashMap<u32, usize> = HashMap::new();
        let mut y_counts: HashMap<u32, usize> = HashMap::new();
        let mut xo_counts: HashMap<u32, usize> = HashMap::new();
        let mut yo_counts: HashMap<u32, usize> = HashMap::new();

        let crop_regex = Regex::new(r"crop=(\d+):(\d+):(\d+):(\d+)").map_err(|e| e.to_string())?;

        for point in probe_points {
            let time_str = to_timestamp(point);
            if let Ok(stderr) = probe_crop(file, &time_str, ffmpeg_root).await {
                for line in stderr.lines() {
                    if let Some(caps) = crop_regex.captures(line) {
                        if let (Ok(w), Ok(h), Ok(xo), Ok(yo)) = (
                            caps[1].parse::<u32>(),
                            caps[2].parse::<u32>(),
                            caps[3].parse::<u32>(),
                            caps[4].parse::<u32>(),
                        ) {
                            *x_counts.entry(w).or_insert(0) += 1;
                            *y_counts.entry(h).or_insert(0) += 1;
                            *xo_counts.entry(xo).or_insert(0) += 1;
                            *yo_counts.entry(yo).or_insert(0) += 1;
                        }
                    }
                }
            }
        }

        if !x_counts.is_empty() && !y_counts.is_empty() {
            let common_x = get_most_common(&x_counts);
            let common_y = get_most_common(&y_counts);
            let common_xo = get_most_common(&xo_counts);
            let common_yo = get_most_common(&yo_counts);

            if common_x > 0 && common_y > 0 {
                actual_w = common_x;
                actual_h = common_y;
                offset_x = common_xo;
                offset_y = common_yo;
            }
        }
    }

    let mut aspect = format!("{}:{}", actual_w, actual_h);
    if actual_h > 0 {
        let ratio = actual_w as f64 / actual_h as f64;
        for &(known_name, known_val) in KNOWN_RATIOS {
            if (known_val - ratio).abs() < 0.1 {
                aspect = known_name.to_string();
                if offset_x == 0 && offset_y < 10 {
                    actual_h = file_h.min((actual_w as f64 / known_val).floor() as u32);
                    offset_y = 0;
                } else if offset_y == 0 && offset_x < 10 {
                    actual_w = file_w.min((actual_h as f64 * known_val).floor() as u32);
                    offset_x = 0;
                }
                break;
            }
        }
    }

    Ok(DetectedDimensions {
        file_width: file_w,
        file_height: file_h,
        actual_width: actual_w,
        actual_height: actual_h,
        left_offset: offset_x,
        top_offset: offset_y,
        aspect,
        duration,
    })
}
