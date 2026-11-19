"""
Implementation details:
Web application launcher script.
Probes local TCP sockets starting from port 8000 to identify the first available port.
Initializes the Uvicorn ASGI server to host the FastAPI application and launches
the system default browser directed to the dynamically resolved network address.
"""

import socket
import sys
import threading
import time
import webbrowser
import uvicorn


def find_available_port(start_port: int = 8000, max_attempts: int = 50) -> int:
    """
    Scans a sequential range of local port numbers to locate an unoccupied TCP port.
    Prevents server startup collisions when default ports are occupied by existing services.
    """
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe_socket:
            try:
                probe_socket.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(
        f"Unable to discover an open TCP port within range {start_port} through {start_port + max_attempts}."
    )


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
    Discovers an open port and binds the Uvicorn ASGI server.
    """
    host = "127.0.0.1"
    resolved_port = find_available_port(start_port=8000)
    local_url = f"http://{host}:{resolved_port}"

    print("=" * 60)
    print(" Starting YouTube Media Suite Web UI ")
    if resolved_port != 8000:
        print(f" Notice: Port 8000 was busy. Switched automatically to port {resolved_port}.")
    print(f" Serving at: {local_url}")
    print(" Press Ctrl+C in this terminal to stop the server.")
    print("=" * 60)

    open_browser_delayed(local_url, delay_seconds=1.2)
    uvicorn.run(
        "web.app:app",
        host=host,
        port=resolved_port,
        reload=True,
        reload_dirs=["web", "core"],
    )


if __name__ == "__main__":
    start_server()
