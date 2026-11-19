"""
Implementation details:
Web application launcher script.
Initializes the Uvicorn ASGI server to host the FastAPI application and launches
the system default browser directed to the local web interface.
"""

import sys
import webbrowser
import threading
import time
import uvicorn


def open_browser_delayed(url: str, delay_seconds: float = 1.0) -> None:
    """
    Spawns a background timer to trigger the local web browser after the ASGI server initializes.
    """
    def target() -> None:
        time.sleep(delay_seconds)
        webbrowser.open(url)

    thread = threading.Thread(target=target, daemon=True)
    thread.start()


def start_server() -> None:
    """
    Binds the Uvicorn server to localhost on port 8000.
    """
    host = "127.0.0.1"
    port = 8000
    local_url = f"http://{host}:{port}"

    print("=" * 50)
    print(" Starting YouTube Downloader & Enhancer Web UI ")
    print(f" Serving at: {local_url}")
    print(" Press Ctrl+C in this terminal to stop the server.")
    print("=" * 50)

    open_browser_delayed(local_url, delay_seconds=1.2)
    uvicorn.run("web.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    start_server()
