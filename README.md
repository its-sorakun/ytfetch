<!--
Implementation details:
Documentation file outlining project architecture, installation instructions, and operational execution steps.
Details cover automatic configuration through setup.ps1, manual setup procedures, and runtime stream remuxing.
-->

# YouTube Video Downloader

A lightweight, modular Python application designed to download YouTube videos in high quality. The tool automatically resolves and creates a dedicated `ytdownload` folder inside the system Downloads directory, downloads separate high-definition video and audio tracks via `yt-dlp`, and merges them into an MP4 container using FFmpeg.

## Features

- Automatic creation of the output folder at `Downloads/ytdownload`.
- Best available video and audio stream extraction merged via FFmpeg into standard MP4.
- Automated environment provisioning script (`setup.ps1`) for Windows.
- Clean command-line interface with interactive fallback prompt when no arguments are supplied.
- Clear transfer metrics (percentage, transfer speed, estimated time remaining).

## Prerequisites

- Python 3.10 or higher.
- PowerShell 5.1 or PowerShell 7+ (for Windows automated setup).

## Setup Guide

### Method 1: Automated Setup (Recommended on Windows)

The repository includes a PowerShell configuration script (`setup.ps1`) that detects existing FFmpeg installations, downloads and configures the latest release build under the user AppData directory if missing, registers the binary directory to the User PATH environment variable, and installs all dependencies from `requirements.txt`.

1. Open PowerShell in the project directory.
2. Run the setup script:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

3. Once the setup completes, open a new terminal window (or use the active session) to ensure PATH updates are loaded.

### Method 2: Manual Setup

If manual configuration is preferred:

1. Install Python packages:

```bash
pip install -r requirements.txt
```

2. Install FFmpeg:
   - Download FFmpeg for Windows from official sources (such as gyan.dev).
   - Extract the archive and place the `bin` folder on the system or user `PATH`.
   - Verify the installation:

```bash
ffmpeg -version
```

## Usage

### 1. Command-Line Argument

Provide the YouTube video URL directly when executing the script:

```bash
python download_video.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

### 2. Interactive Prompt

Run the script without arguments to enter the target URL interactively:

```bash
python download_video.py
```

```text
Enter YouTube video URL: https://www.youtube.com/watch?v=VIDEO_ID
```

## Storage Location

Downloaded media files are automatically saved to:

- Windows: `%USERPROFILE%\Downloads\ytdownload\`
- Linux/macOS: `~/Downloads/ytdownload/`

File names are sanitized for Windows filesystems and formatted as `%(title)s.%(ext)s`.
