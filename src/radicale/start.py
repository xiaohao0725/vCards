"""Radicale 启动入口 — 带日志中间件"""

import os

os.environ.setdefault("RADICALE_CONFIG", "/etc/radicale/config")

from radicale import application
from logger_middleware import LogsMiddleware, logger as log_sdk

app = LogsMiddleware(application())

if __name__ == "__main__":
    import sys
    from radicale import VERSION
    from radicale.server import serve

    print(f"[logs-sdk] Radicale v{VERSION} + logs-sdk 启动")
    try:
        serve(app, sys.argv[1:] if len(sys.argv) > 1 else [])
    except KeyboardInterrupt:
        pass
    finally:
        log_sdk.close()
        print("[logs-sdk] 已关闭")
