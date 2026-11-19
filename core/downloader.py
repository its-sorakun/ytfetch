"""
Implementation details:
Core module responsible for YouTube media extraction and filesystem management.
Resolves the 'ytdownload' destination directory inside the system Downloads path.
Integrates with yt-dlp to download separate adaptive video and audio tracks,
merging streams into an MP4 container via FFmpeg.
Supports standard console progress output as well as structured callback hooks for web progress streaming.
"""

import sys
from pathlib import Path
from typing import Callable, Optional
import yt_dlp
from yt_dlp.utils import DownloadError


def resolve_download_directory() -> Path:
    """
    Locates and creates the designated output directory inside the Downloads path.
    On Windows systems, Path.home() resolves to the current user profile root (for example, C:\\Users\\Username).
    Combining Path.home() with 'Downloads' and 'ytdownload' ensures compliance with standard OS folder layouts.
    Directory creation specifies parents=True to construct intermediate directories and exist_ok=True
    to prevent filesystem collision errors if the directory already exists.
    """
    target_directory = Path.home() / "Downloads" / "ytdownload"
    target_directory.mkdir(parents=True, exist_ok=True)
    return target_directory


def validate_target_url(candidate_url: str) -> bool:
    """
    Validates whether the provided string resembles an acceptable web URL structure.
    Checks for presence of HTTP or HTTPS protocol schemes and non-empty content.
    """
    if not candidate_url:
        return False
    stripped = candidate_url.strip()
    is_valid_scheme = stripped.startswith("http://") or stripped.startswith("https://")
    return is_valid_scheme


def default_progress_hook(status_data: dict) -> None:
    """
    Monitors and reports download progress metrics to standard console output.
    Extracted fields include percentage completed, download transfer speed, and estimated time remaining.
    """
    status = status_data.get("status")
    if status == "downloading":
        percent = status_data.get("_percent_str", "N/A").strip()
        speed = status_data.get("_speed_str", "N/A").strip()
        eta = status_data.get("_eta_str", "N/A").strip()
        print(f"\rDownloading: {percent} | Speed: {speed} | ETA: {eta}   ", end="", flush=True)
    elif status == "finished":
        filename = status_data.get("filename", "Media track")
        print(f"\nDownload finished for: {Path(filename).name}. Processing and remuxing streams...")


def build_download_configuration(
    destination_directory: Path,
    custom_progress_hook: Optional[Callable[[dict], None]] = None,
) -> dict:
    """
    Constructs the operational options dictionary passed to the yt-dlp extraction engine.
    High-definition YouTube streams (1080p, 2K, 4K) are served as isolated video and audio streams (DASH/HLS).
    Requesting 'bestvideo+bestaudio/best' instructs yt-dlp to download the highest quality individual streams.
    The 'merge_output_format': 'mp4' directive instructs FFmpeg to remux isolated streams into an MP4 container.
    The 'windowsfilenames': True directive replaces characters prohibited by Windows NTFS filesystems (: * ? < > |).
    """
    output_template = str(destination_directory / "%(title)s.%(ext)s")
    hooks = [custom_progress_hook] if custom_progress_hook else [default_progress_hook]

    configuration_options = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "outtmpl": output_template,
        "progress_hooks": hooks,
        "noplaylist": True,
        "windowsfilenames": True,
        "quiet": False,
        "no_warnings": False,
    }
    return configuration_options


def download_youtube_video(
    video_url: str,
    destination_directory: Optional[Path] = None,
    progress_callback: Optional[Callable[[dict], None]] = None,
) -> tuple[bool, str]:
    """
    Initializes yt-dlp with the configured parameters and executes the media download task.
    Returns a tuple containing a boolean success flag and an informative status or error message.
    """
    target_directory = destination_directory or resolve_download_directory()
    download_options = build_download_configuration(target_directory, progress_callback)

    try:
        with yt_dlp.YoutubeDL(download_options) as ydl_client:
            ydl_client.download([video_url])
        return True, "Download completed successfully."
    except DownloadError as download_exception:
        error_message = f"Download failed due to an extraction or network error: {download_exception}"
        print(f"\n{error_message}", file=sys.stderr)
        return False, error_message

