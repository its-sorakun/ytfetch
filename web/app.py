"""
Implementation details:
FastAPI backend service providing REST, file streaming, and Server-Sent Events (SSE) interfaces.
Coordinates asynchronous background execution of YouTube video downloads and FFmpeg media enhancement.
Streams real-time progress metrics to connected web clients using persistent HTTP event streams.
Supports direct binary video file uploads, local media stream previews, folder opening, and Windows Explorer file revelation.
"""

import asyncio
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
from typing import Optional
import uuid

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.downloader import (
    resolve_download_directory,
    validate_target_url,
    download_youtube_video,
    build_download_configuration,
)
from core.enhancer import (
    generate_output_path,
    construct_ffmpeg_command,
    execute_ffmpeg_process,
)

app = FastAPI(title="YtFetch Web API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


class DownloadRequest(BaseModel):
    url: str
    quality: Optional[str] = "best"


class EnhanceRequest(BaseModel):
    source_path: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    mode: str = "crf"
    bitrate: Optional[str] = "25M"


class RevealRequest(BaseModel):
    path: str


def update_job_status(job_id: str, **kwargs) -> None:
    """
    Updates operational metrics for a specific background job in a thread-safe manner.
    """
    with jobs_lock:
        if job_id in active_jobs:
            active_jobs[job_id].update(kwargs)


def resolve_stream_format(quality_choice: str) -> tuple[str, str]:
    """
    Translates user-selected quality presets into yt-dlp format strings and container targets.
    """
    if quality_choice == "audio_only":
        return "bestaudio/best", "m4a"
    if quality_choice == "1080p":
        return "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best", "mp4"
    if quality_choice == "720p":
        return "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best", "mp4"
    return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best", "mp4"


def run_download_worker(job_id: str, target_url: str, output_directory: Path, quality: str) -> None:
    """
    Executes yt-dlp download in a background thread and forwards progress to the job store.
    """
    def progress_callback(status_data: dict) -> None:
        status = status_data.get("status", "downloading")
        percent = status_data.get("_percent_str", "0%").strip()
        speed = status_data.get("_speed_str", "N/A").strip()
        eta = status_data.get("_eta_str", "N/A").strip()
        filename = status_data.get("filename", "")

        update_job_status(
            job_id,
            status=status,
            percent=percent,
            speed=speed,
            eta=eta,
            filename=Path(filename).name if filename else "",
        )

    format_selector, merge_format = resolve_stream_format(quality)
    config = build_download_configuration(output_directory, progress_callback)
    config["format"] = format_selector
    config["merge_output_format"] = merge_format

    try:
        import yt_dlp
        with yt_dlp.YoutubeDL(config) as ydl_client:
            ydl_client.download([target_url])

        update_job_status(job_id, status="completed", percent="100%", message="Download completed successfully.")
    except Exception as unexpected_error:
        update_job_status(job_id, status="failed", error=str(unexpected_error))


def run_enhance_worker(job_id: str, request_data: EnhanceRequest) -> None:
    """
    Executes FFmpeg clip extraction and re-encoding in a background thread.
    """
    source_file = Path(request_data.source_path.strip("\"'")).resolve()
    if not source_file.is_file():
        update_job_status(job_id, status="failed", error="Source video file does not exist.")
        return

    is_clipped = bool(request_data.start_time or request_data.end_time)
    output_file = generate_output_path(source_file, is_clipped)

    settings = {
        "mode": request_data.mode,
        "crf": "17",
        "preset": "slow",
        "bitrate": request_data.bitrate or "25M",
        "filter": "unsharp=5:5:0.8:5:5:0.4",
        "audio_bitrate": "320k",
    }

    command = construct_ffmpeg_command(
        source_file=source_file,
        output_file=output_file,
        start_time=request_data.start_time,
        end_time=request_data.end_time,
        settings=settings,
    )

    update_job_status(
        job_id,
        status="processing",
        message="Executing FFmpeg remuxing and enhancement filters...",
        output_path=str(output_file),
    )

    success, message = execute_ffmpeg_process(command)

    if success:
        update_job_status(
            job_id,
            status="completed",
            message=f"Enhancement complete. File saved to {output_file.name}",
            output_path=str(output_file),
        )
    else:
        update_job_status(job_id, status="failed", error=message)


@app.post("/api/download")
async def start_download(request: DownloadRequest):
    """
    Registers a new YouTube download operation and spawns an asynchronous worker thread.
    """
    clean_url = request.url.strip()
    if not validate_target_url(clean_url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL supplied.")

    job_id = str(uuid.uuid4())
    output_directory = resolve_download_directory()

    with jobs_lock:
        active_jobs[job_id] = {
            "id": job_id,
            "type": "download",
            "status": "starting",
            "percent": "0%",
            "speed": "Initializing...",
            "eta": "Calculating...",
            "filename": "",
            "message": "Initializing connection to YouTube servers...",
            "error": "",
        }

    worker_thread = threading.Thread(
        target=run_download_worker,
        args=(job_id, clean_url, output_directory, request.quality or "best"),
        daemon=True,
    )
    worker_thread.start()

    return {"job_id": job_id, "status": "started"}


@app.get("/api/download/stream/{job_id}")
async def stream_download_progress(job_id: str):
    """
    Streams live download progress events over Server-Sent Events (SSE).
    """
    async def event_generator():
        while True:
            with jobs_lock:
                job_data = active_jobs.get(job_id)

            if not job_data:
                yield f"data: {json.dumps({'status': 'not_found'})}\n\n"
                break

            yield f"data: {json.dumps(job_data)}\n\n"

            if job_data.get("status") in ("completed", "failed"):
                break

            await asyncio.sleep(0.35)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/enhance")
async def start_enhancement(request: EnhanceRequest):
    """
    Registers a new video enhancement/clipping operation and begins processing.
    """
    cleaned_path = request.source_path.strip("\"'")
    file_path = Path(cleaned_path).resolve()

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail=f"File not found: {file_path}")

    job_id = str(uuid.uuid4())
    with jobs_lock:
        active_jobs[job_id] = {
            "id": job_id,
            "type": "enhance",
            "status": "starting",
            "message": "Initializing FFmpeg process...",
            "output_path": "",
            "error": "",
        }

    worker_thread = threading.Thread(
        target=run_enhance_worker,
        args=(job_id, request),
        daemon=True,
    )
    worker_thread.start()

    return {"job_id": job_id, "status": "started"}


@app.get("/api/enhance/stream/{job_id}")
async def stream_enhance_progress(job_id: str):
    """
    Streams live enhancement progress events over Server-Sent Events (SSE).
    """
    async def event_generator():
        while True:
            with jobs_lock:
                job_data = active_jobs.get(job_id)

            if not job_data:
                yield f"data: {json.dumps({'status': 'not_found'})}\n\n"
                break

            yield f"data: {json.dumps(job_data)}\n\n"

            if job_data.get("status") in ("completed", "failed"):
                break

            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/upload")
async def upload_video_file(file: UploadFile = File(...)):
    """
    Accepts video file uploads from the web client, saves the binary data
    to the ytdownload directory, and returns the absolute local path for immediate preview and processing.
    """
    target_directory = resolve_download_directory()
    original_name = Path(file.filename).name

    destination_path = target_directory / original_name
    counter = 1
    stem = destination_path.stem
    suffix = destination_path.suffix

    while destination_path.exists():
        destination_path = target_directory / f"{stem}_{counter}{suffix}"
        counter += 1

    try:
        with open(destination_path, "wb") as output_stream:
            shutil.copyfileobj(file.file, output_stream)
    except Exception as io_error:
        raise HTTPException(status_code=500, detail=f"File storage failed: {io_error}")

    file_size_mb = round(destination_path.stat().st_size / (1024 * 1024), 2)
    return {
        "filename": destination_path.name,
        "path": str(destination_path),
        "size_mb": file_size_mb,
    }


@app.get("/api/stream-video")
async def stream_local_video(path: str = Query(..., description="Absolute path to local media file")):
    """
    Provides streaming responses for local media files to allow real-time browser video playback and preview.
    """
    resolved_path = Path(path.strip("\"'")).resolve()

    if not resolved_path.is_file():
        raise HTTPException(status_code=404, detail="Requested media file not found.")

    valid_extensions = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v"}
    if resolved_path.suffix.lower() not in valid_extensions:
        raise HTTPException(status_code=400, detail="Invalid media file extension.")

    extension_map = {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".mov": "video/quicktime",
    }
    media_type = extension_map.get(resolved_path.suffix.lower(), "video/mp4")

    return FileResponse(
        path=resolved_path,
        media_type=media_type,
        filename=resolved_path.name,
    )


@app.post("/api/reveal-in-explorer")
async def reveal_file_in_explorer(request: RevealRequest):
    """
    Invokes the Windows File Explorer process highlighting the designated file on the host filesystem.
    """
    cleaned_path = request.path.strip("\"'")
    target_path = Path(cleaned_path).resolve()

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Designated file does not exist on filesystem.")

    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer.exe", f"/select,{str(target_path)}"])
        else:
            subprocess.Popen(["xdg-open", str(target_path.parent)])
        return {"status": "success", "message": f"Revealed {target_path.name} in Explorer."}
    except Exception as execution_error:
        raise HTTPException(status_code=500, detail=f"Failed to launch explorer: {execution_error}")


@app.post("/api/open-downloads-folder")
async def open_downloads_folder():
    """
    Directly opens the primary ytdownload destination directory inside Windows File Explorer.
    """
    target_folder = resolve_download_directory()
    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer.exe", str(target_folder)])
        else:
            subprocess.Popen(["xdg-open", str(target_folder)])
        return {"status": "success", "message": "Opened downloads folder."}
    except Exception as execution_error:
        raise HTTPException(status_code=500, detail=f"Failed to open downloads folder: {execution_error}")


@app.get("/api/recent-downloads")
async def get_recent_downloads():
    """
    Scans the designated download directory and enumerates recently downloaded video files,
    including modification epoch timestamps and formatted date-time strings.
    """
    download_folder = resolve_download_directory()
    valid_extensions = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4a", ".mp3"}

    files = []
    if download_folder.is_dir():
        for file_path in download_folder.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in valid_extensions:
                try:
                    stat = file_path.stat()
                    size_mb = round(stat.st_size / (1024 * 1024), 2)
                    dt = datetime.fromtimestamp(stat.st_mtime)
                    formatted_time = dt.strftime("%b %d, %Y • %I:%M %p")
                    files.append({
                        "name": file_path.name,
                        "path": str(file_path),
                        "size_mb": size_mb,
                        "modified_timestamp": stat.st_mtime,
                        "modified_formatted": formatted_time,
                    })
                except OSError:
                    continue

    files.sort(key=lambda item: item["modified_timestamp"], reverse=True)
    return {"downloads_directory": str(download_folder), "files": files}


static_directory = Path(__file__).parent / "static"
if static_directory.is_dir():
    app.mount("/static", StaticFiles(directory=str(static_directory)), name="static")


@app.get("/")
async def serve_index():
    """
    Delivers the main application Single Page Application (SPA) entry document.
    """
    index_file = static_directory / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return {"message": "Static assets directory not initialized."}
