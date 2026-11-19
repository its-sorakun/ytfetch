"""
Implementation details:
This module downloads YouTube videos into a dedicated storage directory.
The destination directory is established within the operating system Downloads path under 'ytdownload'.
If the directory does not exist, the filesystem structure is initialized before initiating any download tasks.
Stream selection requests adaptive video and audio tracks, merging the tracks via FFmpeg into an MP4 container.
The script parses target video URLs from command-line arguments or prompts interactively when executed without arguments.
"""

import sys
from pathlib import Path
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


def extract_target_url() -> str:
    """
    Retrieves the YouTube video URL from command-line arguments or prompts via standard input.
    Whitespace is stripped from both ends of the input string to eliminate accidental whitespace characters.
    """
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].strip()

    prompted_url = input("Enter YouTube video URL: ").strip()
    return prompted_url


def validate_target_url(candidate_url: str) -> bool:
    """
    Validates whether the provided string resembles an acceptable web URL structure.
    Checks for presence of HTTP or HTTPS protocol schemes and non-empty content.
    """
    if not candidate_url:
        return False
    is_valid_scheme = candidate_url.startswith("http://") or candidate_url.startswith("https://")
    return is_valid_scheme


def display_progress_notification(status_data: dict) -> None:
    """
    Monitors and reports download progress metrics transmitted by the yt-dlp runtime hook.
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


def build_download_configuration(destination_directory: Path) -> dict:
    """
    Constructs the operational options dictionary passed to the yt-dlp extraction engine.
    High-definition YouTube streams (1080p, 2K, 4K) are served as isolated video and audio streams (DASH/HLS).
    Requesting 'bestvideo+bestaudio/best' instructs yt-dlp to download the highest quality individual streams.
    The 'merge_output_format': 'mp4' directive instructs FFmpeg to remux isolated streams into an MP4 container.
    The 'windowsfilenames': True directive replaces characters prohibited by Windows NTFS filesystems (: * ? < > |).
    """
    output_template = str(destination_directory / "%(title)s.%(ext)s")

    configuration_options = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "outtmpl": output_template,
        "progress_hooks": [display_progress_notification],
        "noplaylist": True,
        "windowsfilenames": True,
        "quiet": False,
        "no_warnings": False,
    }
    return configuration_options


def download_youtube_video(video_url: str, destination_directory: Path) -> bool:
    """
    Initializes yt-dlp with the configured parameters and executes the media download task.
    Catches DownloadError exceptions explicitly to report stream access, geo-blocking, or network failures
    without interrupting execution with an unhandled Python traceback.
    """
    download_options = build_download_configuration(destination_directory)

    print(f"\nTarget storage location: {destination_directory}")
    print(f"Resolving video stream for: {video_url}")

    try:
        with yt_dlp.YoutubeDL(download_options) as ydl_client:
            ydl_client.download([video_url])
        print("\nProcess completed successfully. Saved to target directory.")
        return True
    except DownloadError as download_exception:
        print(f"\nDownload failed due to an extraction or network error: {download_exception}", file=sys.stderr)
        return False


def run_downloader_cli() -> int:
    """
    Coordinates application initialization, directory verification, input processing, and download execution.
    Returns 0 on successful download and 1 on operational failure.
    """
    storage_directory = resolve_download_directory()

    target_url = extract_target_url()
    if not validate_target_url(target_url):
        print("Invalid URL provided. Please provide a valid URL beginning with http:// or https://", file=sys.stderr)
        return 1

    success = download_youtube_video(target_url, storage_directory)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(run_downloader_cli())

