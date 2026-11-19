"""
Implementation details:
This module extracts and enhances video clips from local media files using FFmpeg.
The processing pipeline supports time-based seeking to isolate specific segments from long recordings,
avoiding the need to process entire multi-hour files.
Fast container-level seeking is employed by positioning seek flags prior to input stream declaration.
Visual clarity is enhanced through unsharp mask filtering and perceptual rate-control encoding (CRF)
or user-specified high bitrates, combined with high-fidelity 320 kbps AAC audio remuxing.
"""

import subprocess
import sys
from pathlib import Path


def prompt_for_input_file() -> Path:
    """
    Acquires and validates the source video file path from command-line arguments or interactive input.
    Windows drag-and-drop operations frequently enclose paths in double or single quotation marks.
    Surrounding quotes and extraneous whitespace characters are stripped before validation.
    """
    if len(sys.argv) > 1 and sys.argv[1].strip():
        raw_path = sys.argv[1].strip()
    else:
        raw_path = input("Enter path to input video file (or drag and drop file here): ").strip()

    cleaned_path_string = raw_path.strip("\"'")
    resolved_file_path = Path(cleaned_path_string).resolve()

    if not resolved_file_path.is_file():
        raise FileNotFoundError(f"Source video file not found at: {resolved_file_path}")

    return resolved_file_path


def prompt_for_time_range() -> tuple[str | None, str | None]:
    """
    Collects optional start and end time boundaries for clipping operations.
    FFmpeg accepts timestamps in sexagesimal format (HH:MM:SS or MM:SS) or decimal seconds.
    Blank inputs indicate that extraction begins at the video start or continues through the file termination.
    """
    print("\n--- Clip Range Selection ---")
    print("Leave fields blank to process the entire video duration.")

    start_input = input("Start time (HH:MM:SS, MM:SS, or seconds) [default: start]: ").strip()
    end_input = input("End time (HH:MM:SS, MM:SS, or seconds) [default: end]: ").strip()

    start_time = start_input if start_input else None
    end_time = end_input if end_input else None

    return start_time, end_time


def prompt_for_enhancement_settings() -> dict:
    """
    Determines rate control parameters and video filter options.
    Perceptual Constant Rate Factor (CRF 17) provides visually near-lossless compression without arbitrary bit budgets.
    Explicit target bitrate mode is available when specific data delivery constraints are requested.
    Unsharp masking applies luminance edge sharpening to counteract compression blur artifacts.
    """
    print("\n--- Enhancement Mode ---")
    print("1. High-Fidelity Perceptual Mastering (CRF 17, unsharp edge filter, 320k AAC audio) [Recommended]")
    print("2. Custom Target Bitrate (Specify video bitrate e.g., 20M, 35M, 50M)")

    selection = input("Select mode (1 or 2) [default: 1]: ").strip()

    if selection == "2":
        bitrate_input = input("Enter target video bitrate (e.g., 20M, 35M) [default: 25M]: ").strip()
        target_bitrate = bitrate_input if bitrate_input else "25M"
        return {
            "mode": "target_bitrate",
            "bitrate": target_bitrate,
            "filter": "unsharp=5:5:0.8:5:5:0.4",
            "audio_bitrate": "320k",
        }

    return {
        "mode": "crf",
        "crf": "17",
        "preset": "slow",
        "filter": "unsharp=5:5:0.8:5:5:0.4",
        "audio_bitrate": "320k",
    }


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
    start_time: str | None,
    end_time: str | None,
    settings: dict,
) -> list[str]:
    """
    Assembles the FFmpeg CLI argument list with optimized flag ordering.
    Positioning the start seek flag (-ss) before the input flag (-i) invokes container-level demuxer seeking,
    jumping directly to nearest keyframes without decoding preceding hours of video content.
    The -movflags +faststart parameter moves the MP4 MOOV atom to the beginning of the file for instant streaming.
    """
    command = ["ffmpeg", "-y"]

    # Pre-input seeking dramatically accelerates start discovery on long media files
    if start_time:
        command.extend(["-ss", start_time])

    if end_time:
        command.extend(["-to", end_time])

    command.extend(["-i", str(source_file)])

    # Video filters: apply edge sharpening
    if settings.get("filter"):
        command.extend(["-vf", settings["filter"]])

    # Video encoding codec and rate control
    command.extend(["-c:v", "libx264"])

    if settings["mode"] == "crf":
        command.extend(["-crf", settings["crf"], "-preset", settings.get("preset", "slow")])
    elif settings["mode"] == "target_bitrate":
        command.extend(["-b:v", settings["bitrate"], "-preset", "slow"])

    # High quality audio encoding
    command.extend(["-c:a", "aac", "-b:a", settings.get("audio_bitrate", "320k")])

    # Optimize MP4 container layout for immediate progressive playback
    command.extend(["-movflags", "+faststart"])

    command.append(str(output_file))
    return command


def execute_ffmpeg_process(ffmpeg_command: list[str]) -> bool:
    """
    Dispatches the constructed FFmpeg command to the operating system shell process.
    Handles missing executable errors explicitly when FFmpeg is absent from PATH.
    """
    print("\nExecuting FFmpeg with configuration:")
    print(" ".join(f'"{arg}"' if " " in arg else arg for arg in ffmpeg_command))
    print()

    try:
        completed_process = subprocess.run(ffmpeg_command, check=True)
        return completed_process.returncode == 0
    except FileNotFoundError:
        print(
            "Error: FFmpeg executable was not discovered on system PATH. "
            "Execute the setup.ps1 script to install and register FFmpeg.",
            file=sys.stderr,
        )
        return False
    except subprocess.CalledProcessError as process_error:
        print(f"FFmpeg processing failed with exit code: {process_error.returncode}", file=sys.stderr)
        return False


def run_enhancer_cli() -> int:
    """
    Coordinates application initialization, input gathering, parameter generation, and FFmpeg execution.
    Returns 0 on successful processing and 1 on error.
    """
    try:
        source_path = prompt_for_input_file()
    except (FileNotFoundError, ValueError) as input_error:
        print(f"Input error: {input_error}", file=sys.stderr)
        return 1

    start_time, end_time = prompt_for_time_range()
    is_clipped = bool(start_time or end_time)

    settings = prompt_for_enhancement_settings()
    destination_path = generate_output_path(source_path, is_clipped)

    print(f"\nSource: {source_path}")
    print(f"Destination: {destination_path}")
    if is_clipped:
        print(f"Clip Range: {start_time or '00:00:00'} -> {end_time or 'end of file'}")

    ffmpeg_args = construct_ffmpeg_command(
        source_file=source_path,
        output_file=destination_path,
        start_time=start_time,
        end_time=end_time,
        settings=settings,
    )

    success = execute_ffmpeg_process(ffmpeg_args)
    if success:
        print(f"\nProcessing complete! Enhanced video saved to: {destination_path}")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(run_enhancer_cli())
