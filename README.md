<!--
Implementation details:
Documentation file outlining project architecture, installation instructions, and operational execution steps.
Details cover automatic virtual environment provisioning through setup.ps1, FastAPI web server operations,
automatic socket port resolution, Windows 11 Fluent 2 dual-card layout, Lucide iconography,
video file uploads, inline playback previews, Windows Explorer revelation, and standalone command-line scripts.
-->

# YtFetch

A modular Windows 11 Fluent 2 media workstation designed to download YouTube streams in pristine quality and provide on-demand video clipping and quality enhancement. The system offers both a FastAPI web interface built with a dual-card horizontal layout and standalone command-line utilities.

## Features

- **Windows 11 Fluent 2 Design System**: Utilizes Mica background blooms and Acrylic optical diffusion with rounded 16px geometry, subtle specular highlights, organic click ripples, and rotating conic focus borders. Supports both Dark and Light modes with persistent preference storage.
- **Widescreen Dual-Card Architecture**: Maximizes display real estate by horizontally organizing the interface into two balanced panels:
  - **Left Card (Workbench)**: Houses active operational tools for downloading streams or clipping/enhancing video files.
  - **Right Card (Recent Media)**: Persistent media manager displaying saved files, formatted timestamps (date and time), and file sizes.
- **Windows Explorer File Revelation**: One-click "Explorer" button on any recent media item immediately triggers Windows File Explorer with the designated file selected.
- **Client-Side File Sorting**: Sort recent downloads on demand by Newest First, Oldest First, Name (A-Z), or Size (Largest First).
- **Lucide Iconography**: Integrated Lucide icon suite providing crisp, lightweight Windows 11 style iconography.
- **Dynamic Port Resolution**: Probes local TCP sockets starting from port 8000 to identify the first unoccupied port, preventing startup failures when port 8000 is bound by other services.
- **Video Uploader & Dropzone**: Drag-and-drop local video files directly into the web interface or browse files through the browser.
- **Inline Video Playback Preview**: Inspect uploaded or downloaded videos directly within the web interface with synchronized playhead tracking.
- **Playhead Timecode Synchronization**: Extract video clips with precision by setting start and end boundaries directly from the active playback position.
- **Server-Sent Events (SSE)**: Real-time telemetry streaming download percentages, transfer speeds, and ETA metrics directly to the browser without polling overhead.
- **High-Definition Stream Merging**: Automatically combines high-resolution video and audio streams via FFmpeg into universal MP4 files.
- **Fast Container-Level Seeking**: Rapid container-level seeking (`-ss` before `-i`) to extract short clips from multi-hour files with unsharp edge filtering and perceptual CRF 17 mastering.
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
│   ├── app.py              # FastAPI server with SSE streaming, file upload, & Explorer revelation
│   └── static/
│       ├── index.html      # Windows 11 dual-card UI with Lucide icons & video preview player
│       ├── style.css       # Fluent 2 design system, Mica blooms, Acrylic glass, light/dark themes
│       └── app.js          # Tab navigation, sorting, Explorer reveal, dropzone upload, SSE listeners
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

- **Header Bar**:
  - Displays the clean "YtFetch" title on the top left.
  - Centered segmented tab switcher for Downloader and Enhancer with smooth indicator slider.
  - Theme toggle on the top right for instant switching between Dark and Light themes.
- **Left Workbench Card**:
  - **Downloader Tab**: Paste any YouTube video URL into the acrylic input field. The field incorporates an organic click ripple and rotating conic glow on focus. Real-time progress is streamed live via SSE.
  - **Enhancer Tab**: Drag and drop any video file onto the dropzone or specify an absolute path. Inspect the clip in the integrated preview player, use the playhead synchronization buttons to set start/end timestamps, select a mastering profile (Perceptual CRF 17 or Custom Bitrate), and run the FFmpeg pipeline.
- **Right Recent Media Card**:
  - Displays media files located in `Downloads/ytdownload`.
  - Displays file size alongside exact modification date and time timestamps (e.g. `Nov 19, 2026 • 01:25 PM`).
  - Sort dropdown allows ordering by Newest First, Oldest First, Name (A-Z), or Size (Largest).
  - Includes a dedicated "Explorer" button that opens Windows File Explorer with that specific file selected.
  - Includes "Preview" and "Enhance" buttons to immediately route any file to the workbench on the left.

## Technical Implementations

### 1. Windows File Explorer Revelation
The `/api/reveal-in-explorer` endpoint uses Python's `subprocess.Popen` to invoke `explorer.exe /select,"<absolute_path>"`. This launches the native Windows File Explorer process and highlights the target file directly in its directory.

### 2. Automatic Socket Port Resolution
To avoid `WinError 10048` socket collisions when port 8000 is bound by existing local services, `run_web.py` uses Python's standard `socket` module to sequentially test addresses on `127.0.0.1` before passing the validated port to `uvicorn.run()`.

### 3. Dual-Theme Windows 11 Fluent 2 Materials
The visual system pairs CSS `backdrop-filter` acrylic glass surfaces with dynamic animated radial glow meshes that float continuously behind the acrylic cards. In Light mode, milk-glass opacity with subtle shadow elevation creates soft tactile depth. In Dark mode, deep obsidian surfaces reflect neon accent gradients.

### 4. Server-Sent Events (SSE) Architecture
Rather than polling REST endpoints, `web/app.py` exposes persistent event streams (`/api/download/stream/{job_id}` and `/api/enhance/stream/{job_id}`). Background worker threads forward `yt-dlp` and FFmpeg progress metrics into a thread-safe dictionary, while asynchronous event generators yield newline-delimited JSON payloads over standard HTTP.

### 5. Fast Container-Level Seeking
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
