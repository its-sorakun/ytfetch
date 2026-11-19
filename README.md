<!--
Implementation details:
Documentation file outlining project architecture, installation instructions, and operational execution steps.
Details cover automatic virtual environment provisioning through setup.ps1, FastAPI web server operations,
automatic socket port resolution, dual-theme acrylic optical design, direct video uploads,
inline playback preview, and standalone command-line scripts.
-->

# YouTube Media Suite

A high-performance, modular application designed to download YouTube streams in pristine quality and provide on-demand video clipping and quality enhancement. The system offers both a FastAPI-powered web interface built with a dual-theme Acrylic blur design and standalone command-line utilities.

## Features

- **Dual-Theme Acrylic Blur Interface**: Native optical diffusion utilizing backdrop filters, radiant ambient blooms, organic click ripples, rotating conic focus borders, and fluid transitions without React or third-party frontend dependencies. Supports both Dark and Light themes with persistent preference storage.
- **Dynamic Port Resolution**: Automatically probes local TCP ports starting at 8000 and binds to the first available port (e.g. 8001), preventing startup crashes when port 8000 is occupied.
- **Integrated Video Uploader & Dropzone**: Drag-and-drop local video files directly into the web interface or select files through the browser.
- **Inline Video Playback Preview**: Inspect uploaded or downloaded videos directly within the web interface with synchronized timecode tracking.
- **Playhead Timecode Synchronization**: Extract video clips with precision by setting start and end boundaries directly from the active playback position.
- **Server-Sent Events (SSE)**: Real-time telemetry streaming download percentages, transfer speeds, and ETA metrics directly to the browser without polling overhead.
- **High-Definition Stream Merging**: Automatically combines high-resolution video and audio streams via FFmpeg into universal MP4 files.
- **On-Demand Clipping & Enhancing**: Rapid container-level seeking (`-ss` before `-i`) to extract short clips from multi-hour files with unsharp edge filtering and perceptual CRF 17 mastering.
- **Automated Directory Management**: Automatically initializes the target `Downloads/ytdownload` folder.
- **Isolated Virtual Environment**: Setup script automatically provisions `.venv` to prevent module version collisions with other projects.

## Project Structure

```text
ytdwnl/
├── core/
│   ├── __init__.py
│   ├── downloader.py       # Core yt-dlp extraction & progress hook architecture
│   └── enhancer.py         # Core FFmpeg clipping, rate control, & unsharp filtering
├── web/
│   ├── __init__.py
│   ├── app.py              # FastAPI server with SSE streaming, file upload, & video streaming
│   └── static/
│       ├── index.html      # Acrylic dual-tab UI with light/dark theme & video preview player
│       ├── style.css       # Acrylic design system, fluid ripples, conic focus borders, themes
│       └── app.js          # Tab navigation, theme toggling, dropzone upload, SSE listeners
├── download_video.py       # Standalone CLI downloader (imports core.downloader)
├── enhance_clip.py         # Standalone CLI enhancer (imports core.enhancer)
├── run_web.py              # Web application launcher with auto-port discovery
├── requirements.txt        # Package dependencies (unpinned for maximum compatibility)
├── setup.ps1               # Automated Windows setup (FFmpeg + venv + pip)
└── README.md
```

## Setup Guide

### Method 1: Automated Setup (Recommended on Windows)

The provided `setup.ps1` script provisions an isolated virtual environment (`.venv`), installs current versions of all dependencies, verifies or downloads the latest official Windows FFmpeg release from gyan.dev, and registers necessary environment variables.

1. Open PowerShell in the project directory.
2. Run the setup script:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

3. The virtual environment is created and activated automatically for the current session.

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

The launcher tests local socket availability starting from port 8000. If port 8000 is occupied, it switches automatically to the next open port (such as 8001), outputs a status notice, and opens the default web browser.

### Web Interface Capabilities

- **Downloader Tab**:
  - Paste any YouTube video URL into the acrylic input field.
  - The input field features an organic click ripple and a rotating conic gradient glow on focus without hover interference.
  - Real-time download progress, transfer speed, and ETA are streamed via Server-Sent Events (SSE).
  - The Recent Downloads panel lists downloaded files with one-click shortcuts to preview or send files directly to the Enhancer tab.
- **Enhancer Tab**:
  - Drag and drop any video file onto the upload zone, browse local files, or enter an absolute file path.
  - View the video in the integrated preview player with real-time timecode readouts.
  - Click "Set as Start Time" or "Set as End Time" while watching the video to automatically populate the clipping boundaries.
  - Choose between High-Fidelity Perceptual Mastering (`CRF 17`, unsharp edge filter, `320k` AAC audio) or Custom Bitrate (`-b:v`).
  - View the generated output path and immediately preview the enhanced video in the web player.
- **Theme Toggle**:
  - Toggle between Dark and Light mode using the header button. Preferences are persisted in `localStorage`.

## Technical Implementations

### 1. Automatic Socket Port Resolution
To avoid `WinError 10048` socket collisions when port 8000 is bound by existing local services, `run_web.py` uses Python's standard `socket` module to sequentially test addresses on `127.0.0.1` before passing the validated port to `uvicorn.run()`.

### 2. Dual-Theme Optical Acrylic Diffusion
The visual system avoids flat colors and standard glassmorphism specular highlights. Instead, it combines CSS `backdrop-filter: blur(...) saturate(...) contrast(...)` with dynamic animated radial glow meshes that float continuously behind the acrylic surface. In Light mode, milk-glass opacity with subtle shadow elevation creates soft tactile depth. In Dark mode, deep obsidian surfaces reflect neon accent gradients.

### 3. Server-Sent Events (SSE) Architecture
Rather than polling REST endpoints, `web/app.py` exposes persistent event streams (`/api/download/stream/{job_id}` and `/api/enhance/stream/{job_id}`). Background worker threads forward `yt-dlp` and FFmpeg progress metrics into a thread-safe dictionary, while asynchronous event generators yield newline-delimited JSON payloads over standard HTTP.

### 4. Fast Container-Level Seeking
When clipping videos (particularly 6 to 12 hour recordings), placing the seek flag after the input (`-i input.mp4 -ss ...`) requires FFmpeg to decode all preceding frames. `core/enhancer.py` positions `-ss` and `-to` before `-i`, enabling container-level keyframe seeking that jumps to target timestamps in milliseconds.

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
