"""Radicale 启动入口 — 带日志采集"""

import os, json, time, sys

os.environ["RADICALE_CONFIG"] = os.environ.get(
    "RADICALE_CONFIG", "/etc/radicale/config"
)

from logs_sdk import LogSDK
from logs_sdk.types import new_uuid, sanitize_headers, LogEntry

_logger = LogSDK(
    endpoint=os.environ.get(
        "LOGS_ENDPOINT", "https://api.logs.codexs.cn/api/v1/ingest/logs"
    ),
    api_key=os.environ.get("LOGS_API_KEY", ""),
    api_secret=os.environ.get("LOGS_API_SECRET", ""),
    project_slug="vcards",
    environment="production",
    service_name="radicale",
    buffer_size=100,
    flush_interval=5,
    max_body_size=2048,
)

# 加载配置（在 patch 之前）
from radicale.config import load

configuration = load()

# Monkey-patch Radicale 的 Application
from radicale import Application

_orig_call = Application.__call__


def _logged_call(self, environ, start_response):
    entry_uuid = new_uuid()
    start_time = time.time()
    status_code = [200]
    resp_headers = [("Content-Type", "text/plain")]

    def _start_response(status, headers, exc_info=None):
        status_code[0] = int(status.split()[0])
        resp_headers[0] = headers
        return start_response(status, headers, exc_info)

    try:
        for chunk in _orig_call(self, environ, _start_response):
            yield chunk
    except Exception:
        status_code[0] = 500

    duration_ms = int((time.time() - start_time) * 1000)
    scheme = environ.get("wsgi.url_scheme", "https")
    host = environ.get("HTTP_HOST", "")
    path = environ.get("PATH_INFO", "")
    qs = environ.get("QUERY_STRING", "")
    full_url = f"{scheme}://{host}{path}" + (f"?{qs}" if qs else "")

    req_headers = {}
    for k, v in environ.items():
        if k.startswith("HTTP_"):
            name = k[5:].replace("_", "-").title()
            req_headers[name] = v
    if environ.get("CONTENT_TYPE"):
        req_headers["Content-Type"] = environ["CONTENT_TYPE"]

    entry = LogEntry(
        uuid=entry_uuid,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start_time)),
        duration_ms=duration_ms,
        method=environ.get("REQUEST_METHOD", ""),
        scheme=scheme,
        full_url=full_url,
        host_header=host,
        path=path,
        query_string=qs,
        request_headers=sanitize_headers(req_headers),
        request_body="",
        request_body_size=0,
        content_type=req_headers.get("Content-Type", ""),
        status_code=status_code[0],
        response_headers=sanitize_headers(dict(resp_headers[0])),
        response_body="",
        response_body_size=0,
        client_ip=environ.get("HTTP_X_REAL_IP", environ.get("REMOTE_ADDR", "")),
        client_ip_chain=environ.get("HTTP_X_FORWARDED_FOR", ""),
        client_type="other",
        user_agent=req_headers.get("User-Agent", ""),
        is_error=status_code[0] >= 500,
        error_message=f"HTTP {status_code[0]}" if status_code[0] >= 500 else "",
        error_type="http_error" if status_code[0] >= 500 else "",
    )
    _logger.send(entry)


Application.__call__ = _logged_call

# 启动
from radicale import VERSION
from radicale.server import serve

print(f"[logs-sdk] Radicale v{VERSION} 日志已注入", flush=True)

try:
    serve(configuration)
except KeyboardInterrupt:
    pass
finally:
    _logger.close()
