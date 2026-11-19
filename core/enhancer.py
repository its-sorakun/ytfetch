"""
Implementation details:
Core module responsible for video clipping, rate control configuration, and FFmpeg filter execution.
Enables rapid container-level seeking on long media recordings by positioning seek parameters before input declaration.
Applies unsharp mask filtering to counteract compression softening alongside high-quality perceptual rate control (CRF)
or user-specified explicit bitrates.
Supports process execution with real-time progress callbacks for terminal and web presentation layers.
"""

import subprocess
import sys
from pathlib import Path
from typing import Optional, Callable


def generate_output_path(source_file: Path, is_clipped: bool) -> Path:
    """
    Derives an output file path adjacent to the source file with an informative naming suffix.
    If a generated output filename collides with an existing file, a numeric index is incremented
    to prevent unintended file overwrites.
    """
    suffix_tag = "_clip_enhanced" if is_clipped else "_enhanced"
    directory = source_file.parent
    base_stem = source_file.stem
    target_extension = ".mp4"

    candidate_name = f"{base_stem}{suffix_tag}{target_extension}"
    candidate_path = directory / candidate_name

    counter = 1
    while candidate_path.exists():
        candidate_name = f"{base_stem}{suffix_tag}_{counter}{target_extension}"
        candidate_path = directory / candidate_name
        counter += 1

    return candidate_path


def construct_ffmpeg_command(
    source_file: Path,
    output_file: Path,
    start_time: Optional[str],
    end_time: Optional[str],
    settings: dict,
) -> list[str]:
    """
    Assembles the FFmpeg CLI argument list with optimized flag ordering.
    Positioning the start seek flag (-ss) before the input flag (-i) invokes container-level demuxer seeking,
    jumping directly to nearest keyframes without decoding preceding hours of video content.
    The -movflags +faststart parameter moves the MP4 MOOV atom to the beginning of the file for instant streaming.
    """
    command = ["ffmpeg", "-y"]

    if start_time:
        command.extend(["-ss", start_time])

    if end_time:
        command.extend(["-to", end_time])

    command.extend(["-i", str(source_file)])

    if settings.get("filter"):
        command.extend(["-vf", settings["filter"]])

    command.extend(["-c:v", "libx264"])

    mode = settings.get("mode", "crf")
    if mode == "crf":
        command.extend(["-crf", str(settings.get("crf", "17")), "-preset", settings.get("preset", "slow")])
    elif mode == "target_bitrate":
        command.extend(["-b:v", str(settings.get("bitrate", "25M")), "-preset", "slow"])

    command.extend(["-c:a", "aac", "-b:a", str(settings.get("audio_bitrate", "320k"))])
    command.extend(["-movflags", "+faststart"])
    command.append(str(output_file))

    return command


def execute_ffmpeg_process(
    ffmpeg_command: list[str],
    status_callback: Optional[Callable[[str], None]] = None,
) -> tuple[bool, str]:
    """
    Dispatches the constructed FFmpeg command to the operating system shell process.
    Handles missing executable errors explicitly when FFmpeg is absent from PATH.
    """
    if status_callback:
        status_callback("Starting FFmpeg processing...")

    try:
        completed_process = subprocess.run(
            ffmpeg_command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return True, "Processing completed successfully."
    except FileNotFoundError:
        error_text = (
            "FFmpeg executable was not discovered on system PATH. "
            "Ensure FFmpeg is installed and accessible."
        )
        return False, error_text
    except subprocess.CalledProcessError as process_error:
        error_text = f"FFmpeg failed with exit code {process_error.returncode}: {process_error.stderr}"
        return False, error_text

