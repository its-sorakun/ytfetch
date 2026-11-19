"""
Implementation details:
Core module responsible for video clipping, rate control configuration, and FFmpeg filter execution.
Enables rapid container-level seeking on long media recordings by positioning seek parameters before input declaration.
Applies unsharp mask filtering to counteract compression softening alongside high-quality rate control.
Automatically detects and prioritizes dedicated GPU hardware acceleration (NVIDIA NVENC), followed by integrated GPU
options (AMD AMF, Intel QSV), falling back gracefully to multi-threaded CPU software encoding (libx264).
Supports process execution with real-time progress callbacks for terminal and web presentation layers.
"""

from pathlib import Path
import subprocess
import sys
from typing import Optional, Callable

# Cached hardware encoder resolution
_CACHED_HARDWARE_INFO = None


def detect_hardware_encoder() -> tuple[str, str, str]:
    """
    Detects hardware video acceleration in priority order:
    1. Dedicated NVIDIA GPU (h264_nvenc)
    2. Integrated or secondary AMD GPU (h264_amf)
    3. Intel Quick Sync Video (h264_qsv)
    4. Multi-threaded CPU software encoding (libx264)
    Returns a tuple of (encoder_name, hardware_label, description).
    """
    global _CACHED_HARDWARE_INFO
    if _CACHED_HARDWARE_INFO is not None:
        return _CACHED_HARDWARE_INFO

    candidates = [
        ("h264_nvenc", "NVIDIA NVENC (Dedicated GPU)", "NVIDIA hardware-accelerated video encoder"),
        ("h264_amf", "AMD AMF (GPU Accelerated)", "AMD hardware-accelerated video encoder"),
        ("h264_qsv", "Intel QSV (GPU Accelerated)", "Intel QuickSync hardware video encoder"),
    ]

    for enc, label, desc in candidates:
        try:
            probe_cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", "nullsrc=s=256x256:d=0.1:r=30",
                "-c:v", enc,
                "-f", "null", "-",
            ]
            res = subprocess.run(probe_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if res.returncode == 0:
                _CACHED_HARDWARE_INFO = (enc, label, desc)
                return _CACHED_HARDWARE_INFO
        except Exception:
            continue

    _CACHED_HARDWARE_INFO = ("libx264", "Software CPU (libx264)", "CPU software encoding fallback")
    return _CACHED_HARDWARE_INFO


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
    Assembles the FFmpeg CLI argument list with optimized flag ordering and hardware acceleration.
    Positioning the start seek flag (-ss) before the input flag (-i) invokes container-level demuxer seeking,
    jumping directly to nearest keyframes without decoding preceding hours of video content.
    Prioritizes dedicated GPU processing (NVIDIA NVENC) to eliminate CPU bottlenecking.
    The -movflags +faststart parameter moves the MP4 MOOV atom to the beginning of the file for instant streaming.
    """
    encoder, label, _ = detect_hardware_encoder()
    command = ["ffmpeg", "-y"]

    if start_time:
        command.extend(["-ss", start_time])

    if end_time:
        command.extend(["-to", end_time])

    command.extend(["-i", str(source_file)])

    if settings.get("filter"):
        command.extend(["-vf", settings["filter"]])

    mode = settings.get("mode", "crf")

    if encoder == "h264_nvenc":
        command.extend(["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq"])
        if mode == "crf":
            command.extend(["-rc:v", "vbr", "-cq:v", str(settings.get("cq", "19"))])
        elif mode == "target_bitrate":
            bitrate_val = str(settings.get("bitrate", "25M"))
            command.extend(["-b:v", bitrate_val, "-maxrate:v", bitrate_val, "-bufsize:v", "50M"])
    elif encoder == "h264_amf":
        command.extend(["-c:v", "h264_amf", "-quality", "quality"])
        if mode == "crf":
            command.extend(["-rc", "cqp", "-qp_i", "18", "-qp_p", "18"])
        elif mode == "target_bitrate":
            command.extend(["-rc", "cbr", "-b:v", str(settings.get("bitrate", "25M"))])
    elif encoder == "h264_qsv":
        command.extend(["-c:v", "h264_qsv", "-preset", "slow"])
        if mode == "crf":
            command.extend(["-global_quality", "19"])
        elif mode == "target_bitrate":
            command.extend(["-b:v", str(settings.get("bitrate", "25M"))])
    else:
        command.extend(["-c:v", "libx264"])
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
    encoder, label, _ = detect_hardware_encoder()
    if status_callback:
        status_callback(f"Starting processing with {label}...")

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
        return False, "FFmpeg executable was not detected on system PATH."
    except subprocess.CalledProcessError as process_error:
        error_output = process_error.stderr or process_error.stdout or "Unknown execution error."
        return False, f"FFmpeg execution failed: {error_output.strip()}"
