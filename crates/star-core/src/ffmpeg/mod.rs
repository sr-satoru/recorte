pub mod crop;
pub mod detect;
pub mod downloader;

pub use crop::{crop_video, CropJobOptions, ProgressUpdate, DEFAULT_FFMPEG_CROP_TEMPLATE};
pub use detect::{detect_dimensions, get_duration, get_reported_dimensions, DetectedDimensions};
pub use downloader::{
    ensure_app_ffmpeg, get_app_bin_dir, get_app_ffmpeg_paths, is_app_ffmpeg_ready,
    DOWNLOAD_PROGRESS_BYTES, DOWNLOAD_TOTAL_BYTES, IS_DOWNLOADING_FFMPEG,
};
