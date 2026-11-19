<!--
Implementation details:
Documentation file outlining project architecture, installation instructions, and operational execution steps.
Details cover automatic virtual environment provisioning through setup.ps1, FastAPI web server operations,
acrylic blur user interface characteristics, and standalone command-line scripts.
-->

# YouTube Media Suite

A modular application designed to download YouTube streams in high quality and provide on-demand video clipping and quality enhancement. The system includes both a FastAPI web interface built with a native Acrylic blur theme and standalone command-line utilities.

## Features

- **Acrylic Blur Interface**: Native optical diffusion utilizing backdrop filters, organic click ripples, rotating conic focus borders, and fluid transitions without React or external frontend dependencies.
- **Dual-Tab Architecture**: Dedicated panels for YouTube downloading and video clipping/enhancement.
- **Server-Sent Events (SSE)**: Real-time telemetry streaming download percentages, transfer speeds, and ETA metrics directly to the browser.
- **High-Definition Stream Merging**: Automatically combines high-resolution video and audio streams via FFmpeg into universal MP4 files.
- **On-Demand Clipping & Enhancing**: Rapid container-level seeking (`-ss` before `-i`) to extract short clips from multi-hour files with unsharp edge filtering and perceptual CRF 17 mastering.
- **Automated Directory Management**: Automatically initializes the target `Downloads/ytdownload` folder.
- **Isolated Virtual Environment**: Setup script automatically provisions `.venv` to prevent module version collisions with other projects.

## Project Structure

```text
ytdwnl/
├── core/
│   ├── __init__.py
│   ├── downloader.py       # Core yt-dlp extraction and progress callback logic
│   └── enhancer.py         # Core FFmpeg clipping, rate control, and filtering logic
├── web/
│   ├── __init__.py
│   ├── app.py              # FastAPI server with SSE streaming endpoints
│   └── static/
│       ├── index.html      # Acrylic dual-tab user interface
│       ├── style.css       # Acrylic design system, fluid ripples, conic focus borders
│       └── app.js          # Tab navigation, ripple triggers, and SSE listeners
├── download_video.py       # Standalone CLI downloader
├── enhance_clip.py         # Standalone CLI enhancer/clipper
├── run_web.py              # Web application launcher
├── requirements.txt        # Package dependencies (unpinned for maximum compatibility)
├── setup.ps1               # Automated Windows setup (FFmpeg + venv + pip)
└── README.md
```

## Prerequisites

- Python 3.10 or higher.
- PowerShell 5.1 or PowerShell 7+ (for Windows automated setup).

## Setup Guide

### Method 1: Automated Setup (Recommended on Windows)

The provided `setup.ps1` script provisions an isolated virtual environment (`.venv`), installs current versions of all dependencies, verifies or downloads the latest official Windows FFmpeg release from gyan.dev, and registers necessary environment variables.

1. Open PowerShell in the project directory.
2. Run the setup script:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

3. The virtual environment is created and activated automatically.

### Method 2: Manual Setup

1. Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Ensure FFmpeg is installed and accessible on `PATH`:

```bash
ffmpeg -version
```

## Running the Web Interface

Launch the FastAPI application and open the browser interface:

```bash
python run_web.py
```

The application starts an ASGI server at `http://127.0.0.1:8000` and automatically launches the default web browser.

### Web Interface Highlights

- **Downloader Tab**: Paste a YouTube video URL into the acrylic input field to start downloading. A dynamic click ripple responds to mouse interactions, while a rotating conic gradient illuminates the border when focused. Progress metrics update live via SSE.
- **Enhancer Tab**: Select any downloaded video from the recent list or paste an absolute file path. Define optional start and end timestamps (`HH:MM:SS`) to extract a specific segment, select a mastering profile (Perceptual CRF 17 or Custom Bitrate), and run the FFmpeg enhancement pipeline.

## Running the Command-Line Utilities

### Standalone Downloader

Execute with a video URL argument:

```bash
python download_video.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

Or execute without arguments to enter the URL interactively:

```bash
python download_video.py
```

### Standalone Enhancer & Clipper

Execute with a video file path:

```bash
python enhance_clip.py "C:\path\to\video.mp4"
```

Or execute interactively (supports drag-and-drop from Windows File Explorer):

```bash
python enhance_clip.py
```

## Storage Location

Downloaded and enhanced media files are stored in:

- Windows: `%USERPROFILE%\Downloads\ytdownload\`
- Linux/macOS: `~/Downloads/ytdownload/`
