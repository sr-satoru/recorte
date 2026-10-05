use clap::{Parser, Subcommand};
use star_core::{
    crop_video, detect_dimensions, start_engine, CropJobOptions, EngineConfig,
    DEFAULT_FFMPEG_CROP_TEMPLATE,
};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

#[derive(Parser)]
#[command(name = "star")]
#[command(about = "Detects true video dimensions and crops black borders using ffmpeg", long_about = None)]
struct Cli {
    #[arg(short = 'f', long, global = true, help = "Path to ffmpeg directory")]
    ffmpeg_root: Option<String>,

    #[arg(short = 'j', long, global = true, help = "Output as JSON")]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Detects true dimensions and black borders of a video")]
    Detect {
        #[arg(help = "Video file path to detect")]
        file: String,
    },
    #[command(about = "Crop a video file")]
    Crop {
        #[arg(help = "Video file to crop")]
        file: String,
        #[arg(help = "Output destination or 'in-place'")]
        output: String,
        #[arg(short = 'c', long, help = "Crop in format width:height:left:top or 'auto'")]
        crop: Option<String>,
        #[arg(short = 't', long, help = "Custom ffmpeg options template")]
        ffmpeg_options: Option<String>,
        #[arg(short = 'm', long, help = "Crop using h264/hevc bitstream metadata filter")]
        metadata: bool,
    },
    #[command(about = "Start HTTP API server & background queue worker")]
    Serve {
        #[arg(short = 'p', long, default_value_t = 4200, help = "HTTP server port")]
        port: u16,
        #[arg(short = 'c', long, help = "Path to queue SQLite database")]
        config: Option<PathBuf>,
        #[arg(long, help = "Path mappings in format from:to,from2:to2")]
        paths: Option<String>,
        #[arg(short = 'o', long, help = "Default output folder")]
        output_folder: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Detect { file } => {
            let dim = detect_dimensions(&file, cli.ffmpeg_root.as_deref()).await?;
            if cli.json {
                println!("{}", serde_json::to_string_pretty(&dim)?);
            } else {
                println!("file_width:\t{}", dim.file_width);
                println!("file_height:\t{}", dim.file_height);
                println!("actual_width:\t{}", dim.actual_width);
                println!("actual_height:\t{}", dim.actual_height);
                println!("left_offset:\t{}", dim.left_offset);
                println!("top_offset:\t{}", dim.top_offset);
                println!("aspect:\t\t{}", dim.aspect);
                println!("duration:\t{:.2}s", dim.duration);
            }
        }
        Commands::Crop {
            file,
            output,
            crop,
            ffmpeg_options,
            metadata,
        } => {
            let mut crop_coords = [0u32; 4];
            if let Some(c) = crop {
                if c != "auto" {
                    let parts: Vec<&str> = c.split(':').collect();
                    if parts.len() == 4 {
                        crop_coords[0] = parts[0].parse().unwrap_or(0);
                        crop_coords[1] = parts[1].parse().unwrap_or(0);
                        crop_coords[2] = parts[2].parse().unwrap_or(0);
                        crop_coords[3] = parts[3].parse().unwrap_or(0);
                    }
                }
            }

            if crop_coords[0] == 0 && crop_coords[1] == 0 {
                let dim = detect_dimensions(&file, cli.ffmpeg_root.as_deref()).await?;
                crop_coords = [
                    dim.actual_width,
                    dim.actual_height,
                    dim.left_offset,
                    dim.top_offset,
                ];
            }

            let opts = CropJobOptions {
                ffmpeg_root: cli.ffmpeg_root,
                ffmpeg_options: Some(ffmpeg_options.unwrap_or_else(|| DEFAULT_FFMPEG_CROP_TEMPLATE.to_string())),
                crop: crop_coords,
                metadata,
                duration: 0.0,
            };

            println!("Iniciando corte em: {}", file);
            let is_cancelled = Arc::new(AtomicBool::new(false));
            crop_video(&file, &output, opts, is_cancelled, None).await?;
            println!("Corte concluído com sucesso!");
        }
        Commands::Serve {
            port,
            config,
            paths,
            output_folder,
        } => {
            let db_path = config.unwrap_or_else(|| {
                dirs::data_local_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("Star")
                    .join("queue.db")
            });

            let engine_config = EngineConfig {
                db_path,
                http_port: port,
                ffmpeg_root: cli.ffmpeg_root,
                ffmpeg_options: None,
                default_output_folder: output_folder,
                path_mappings: paths,
            };

            println!("[Star] Iniciando servidor na porta {}...", port);
            let _handle = start_engine(engine_config).await?;

            tokio::signal::ctrl_c().await?;
            println!("[Star] Encerrando servidor.");
        }
    }

    Ok(())
}
