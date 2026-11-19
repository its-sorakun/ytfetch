"""
Implementation details:
Core module responsible for video clipping, rate control configuration, and FFmpeg filter execution.
Enables rapid container-level seeking on long media recordings by positioning seek parameters before input declaration.
Applies unsharp mask filtering to counteract compression softening alongside high-quality rate control.
Automatically detects and prioritizes dedicated GPU hardware acceleration (NVIDIA NVENC), followed by integrated GPU
options (AMD AMF, Intel QSV), falling back gracefully to multi-threaded CPU software encoding (libx264).
Performs pre-flight file integrity validation via ffprobe to intercept corrupted files or missing moov atoms.
Implements atomic temporary output file staging and streaming telemetry parser via FFmpeg machine-readable progress pipe.
"""

from pathlib import Path
import re
import subprocess
import sys
import threading
from typing import Optional, Callable

# Cached hardware encoder resolution
_CACHED_HARDWARE_INFO = None


def parse_time_to_seconds(timestamp_str: Optional[str]) -> Optional[float]:
    """
    Parses a HH:MM:SS or MM:SS or raw second string into a floating-point seconds value.
    """
    if not timestamp_str:
        return None
    parts = timestamp_str.strip().split(":")
    try:
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        if len(parts) == 1:
            return float(parts[0])
    except ValueError:
        return None
    return None


def probe_media_file(file_path: Path) -> tuple[bool, float, str]:
    """
    Probes the source media file to verify container integrity and retrieve duration in seconds.
    Intercepts damaged or incomplete media (such as MP4 files missing the moov atom) before FFmpeg encoding.
    Returns (is_valid, duration_seconds, diagnostic_message).
    """
    if not file_path.exists():
        return False, 0.0, "Source media file does not exist on disk."

    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]

    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        if result.returncode != 0:
            err_output = result.stderr.strip()
            if "moov atom not found" in err_output:
                return False, 0.0, "Source video is incomplete or corrupted (missing MP4 moov atom). Please choose a valid file."
            return False, 0.0, f"Cannot read media file: {err_output or 'Invalid data found.'}"

        duration_val = result.stdout.strip()
        duration_sec = float(duration_val) if duration_val else 0.0
        return True, duration_sec, "Media is valid."
    except subprocess.TimeoutExpired:
        return False, 0.0, "Media probe timed out."
    except FileNotFoundError:
        return False, 0.0, "ffprobe executable not found on system PATH."
    except Exception as exc:
        return False, 0.0, f"Probe error: {exc}"


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
    Includes -progress pipe:1 to output machine-readable telemetry on stdout.
    """
    encoder, label, _ = detect_hardware_encoder()
    command = [
        "ffmpeg", "-y",
        "-progress", "pipe:1",
        "-nostats",
    ]

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
    output_file: Path,
    expected_duration: float = 0.0,
    progress_callback: Optional[Callable[[dict], None]] = None,
) -> tuple[bool, str]:
    """
    Executes the FFmpeg transcode pipeline with atomic staging to a temporary file.
    Streams real-time progress percentages, processing speed, and ETA calculations through progress_callback.
    Ensures incomplete or failed runs never leave corrupted files on disk.
    """
    encoder, label, _ = detect_hardware_encoder()
    temp_output_path = output_file.with_name(f".{output_file.name}.tmp.mp4")

    # Divert destination output to temporary file
    actual_command = list(ffmpeg_command)
    if actual_command and actual_command[-1] == str(output_file):
        actual_command[-1] = str(temp_output_path)

    if progress_callback:
        progress_callback({
            "status": "processing",
            "percent": "0%",
            "speed": "Initializing...",
            "eta": "Calculating...",
            "message": f"Starting processing with {label}...",
        })

    process = None
    stderr_lines = []

    try:
        process = subprocess.Popen(
            actual_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )

        # Drain stderr concurrently in a background thread to prevent OS pipe buffer deadlocks
        def drain_stderr():
            if process.stderr:
                for err_line in process.stderr:
                    stderr_lines.append(err_line)

        stderr_thread = threading.Thread(target=drain_stderr, daemon=True)
        stderr_thread.start()

        current_speed = "1.0x"
        current_fps = "0"

        # Stream machine-readable progress lines from FFmpeg stdout
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if not line or "=" not in line:
                    continue

                key, value = line.split("=", 1)

                if key == "speed":
                    current_speed = value.strip()
                elif key == "fps":
                    current_fps = value.strip()
                elif key == "out_time_us":
                    try:
                        elapsed_seconds = float(value) / 1_000_000.0
                        if expected_duration > 0:
                            pct_num = min(99.0, max(0.0, (elapsed_seconds / expected_duration) * 100.0))
                            percent_str = f"{pct_num:.0f}%"

                            # Calculate ETA from current speed multiplier
                            speed_match = re.search(r"([0-9.]+)x", current_speed)
                            speed_mult = float(speed_match.group(1)) if speed_match else 1.0
                            if speed_mult > 0.05:
                                remaining_sec = max(0, int((expected_duration - elapsed_seconds) / speed_mult))
                                eta_str = f"{remaining_sec // 60:02d}:{remaining_sec % 60:02d}"
                            else:
                                eta_str = "--:--"
                        else:
                            percent_str = f"{int(elapsed_seconds)}s"
                            eta_str = "--:--"

                        if progress_callback:
                            speed_display = f"{current_speed} ({current_fps} fps)" if current_fps != "0" else current_speed
                            progress_callback({
                                "status": "processing",
                                "percent": percent_str,
                                "speed": speed_display,
                                "eta": eta_str,
                                "message": f"Remastering frames with {label}...",
                            })
                    except (ValueError, ZeroDivisionError):
                        pass

        process.wait()
        stderr_thread.join(timeout=3.0)

        if process.returncode == 0:
            # Atomic swap of temporary file into permanent destination
            if temp_output_path.exists():
                temp_output_path.replace(output_file)

            if progress_callback:
                progress_callback({
                    "status": "completed",
                    "percent": "100%",
                    "speed": current_speed,
                    "eta": "00:00",
                    "message": f"Enhancement completed successfully with {label}.",
                })
            return True, "Processing completed successfully."

        # If process exited with non-zero status, purge corrupted temp file
        if temp_output_path.exists():
            temp_output_path.unlink(missing_ok=True)

        full_err = "\n".join(stderr_lines).strip()
        # Clean out verbose compiler header banners to extract the concrete error line
        clean_lines = []
        for line in full_err.splitlines():
            line_s = line.strip()
            if not line_s:
                continue
            if line_s.startswith(("configuration:", "ffmpeg version", "built with", "libav", "Press [q] to stop")):
                continue
            clean_lines.append(line_s)

        concise_err = " ".join(clean_lines[-3:]) if clean_lines else "Unknown execution error."
        return False, f"FFmpeg execution failed: {concise_err}"

    except FileNotFoundError:
        if temp_output_path.exists():
            temp_output_path.unlink(missing_ok=True)
        return False, "FFmpeg executable was not detected on system PATH."
    except Exception as general_err:
        if temp_output_path.exists():
            temp_output_path.unlink(missing_ok=True)
        return False, f"Unexpected error during processing: {general_err}"

