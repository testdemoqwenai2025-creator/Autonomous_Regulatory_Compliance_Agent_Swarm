"""Entrypoint for running the gateway directly.

    python -m gateway

Or with uvicorn explicitly:
    uvicorn gateway.app:create_app --factory --host 0.0.0.0 --port 8000
"""

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "gateway.app:create_app",
        factory=True,
        host="0.0.0.0",
        port=int(__import__("os").getenv("GATEWAY_PORT", "8000")),
        reload=False,
        log_level="info",
    )
