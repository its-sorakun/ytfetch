"""
Implementation details:
Command-line interface entry point for downloading YouTube videos.
Imports operational functions from the core.downloader package to preserve separation of concerns.
Coordinates console user interactions, directory validation, and execution exit codes.
Supports optional section-based timestamp clipping via remote HTTP range requests.
"""

import argparse
import sys
from pathlib import Path
from core.downloader import (
    resolve_download_directory,
    validate_target_url,
    download_youtube_video,
)


def run_downloader_cli() -> int:
    """
    Coordinates application initialization, directory verification, input processing, and download execution.
    Supports optional timestamp range clipping via command-line arguments (--start and --end).
    Returns 0 on successful download and 1 on operational failure.
    """
    parser = argparse.ArgumentParser(description="Download YouTube video streams or specific timestamp ranges.")
    parser.add_argument("url", nargs="?", default="", help="YouTube video URL")
    parser.add_argument("--start", dest="start_time", default=None, help="Start timestamp (e.g. 00:01:30 or seconds)")
    parser.add_argument("--end", dest="end_time", default=None, help="End timestamp (e.g. 00:03:00 or seconds)")

    args = parser.parse_args()
    target_url = args.url.strip() if args.url else ""

    if not target_url:
        target_url = input("Enter YouTube video URL: ").strip()

    if not validate_target_url(target_url):
        print("Invalid URL provided. Please provide a valid URL beginning with http:// or https://", file=sys.stderr)
        return 1

    storage_directory = resolve_download_directory()

    print(f"\nTarget storage location: {storage_directory}")
    print(f"Resolving video stream for: {target_url}")
    if args.start_time or args.end_time:
        print(f"Timestamp range clipping: start={args.start_time or '0s'}, end={args.end_time or 'end'}")

    success, message = download_youtube_video(
        target_url,
        storage_directory,
        start_time=args.start_time,
        end_time=args.end_time,
    )
    if success:
        print("\nProcess completed successfully. Saved to target directory.")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(run_downloader_cli())

