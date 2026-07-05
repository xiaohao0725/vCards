"""Radicale 启动入口 — 带日志中间件"""

import os, json, time

os.environ.setdefault("RADICALE_CONFIG", "/etc/radicale/config")

from logs_sdk import LogSDK
from logs_sdk.types import new_uuid, sanitize_headers

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


def _log_request(environ, start_response, _super_call):
    """WSGI 日志记录包装器"""
    entry_uuid = new_uuid()
    start_time = time.time()
    status_code = [200]
    resp_headers = [("Content-Type", "text/plain")]

    def _start_response(status, headers, exc_info=None):
        status_code[0] = int(status.split()[0])
        resp_headers[0] = headers
        return start_response(status, headers, exc_info)

    try:
        for chunk in _super_call(environ, _start_response):
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

    req_body = ""
    try:
        length = int(environ.get("CONTENT_LENGTH", 0))
        if length > 0:
            wsgi_input = environ["wsgi.input"]
            if hasattr(wsgi_input, "read"):
                req_body = wsgi_input.read(length).decode("utf-8", errors="replace")
    except Exception:
        pass

    from logs_sdk.types import LogEntry

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
        request_body=req_body[: _logger.config.max_body_size],
        request_body_size=len(req_body),
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


# Monkey-patch Radicale Application
import radicale.server

_OrigApplication = radicale.server.Application


class LoggedApplication(_OrigApplication):
    def __init__(self, configuration):
        super().__init__(configuration)

    def __call__(self, environ, start_response):
        return _log_request(environ, start_response, super().__call__)


radicale.server.Application = LoggedApplication


if __name__ == "__main__":
    import sys
    from radicale import config as radicale_config, VERSION
    from radicale.server import serve

    configuration = radicale_config.load()
    print(f"[logs-sdk] Radicale v{VERSION} + logs-sdk 启动")

    try:
        serve(configuration)
    except KeyboardInterrupt:
        pass
    finally:
        _logger.close()
        print("[logs-sdk] ���关闭")
