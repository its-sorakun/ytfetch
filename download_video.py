"""
Implementation details:
Command-line interface entry point for downloading YouTube videos.
Imports operational functions from the core.downloader package to preserve separation of concerns.
Coordinates console user interactions, directory validation, and execution exit codes.
"""

import sys
from pathlib import Path
from core.downloader import (
    resolve_download_directory,
    validate_target_url,
    download_youtube_video,
)


def extract_target_url() -> str:
    """
    Retrieves the YouTube video URL from command-line arguments or prompts via standard input.
    Whitespace is stripped from both ends of the input string to eliminate accidental whitespace characters.
    """
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return sys.argv[1].strip()

    prompted_url = input("Enter YouTube video URL: ").strip()
    return prompted_url


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

    print(f"\nTarget storage location: {storage_directory}")
    print(f"Resolving video stream for: {target_url}")

    success, message = download_youtube_video(target_url, storage_directory)
    if success:
        print("\nProcess completed successfully. Saved to target directory.")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(run_downloader_cli())
