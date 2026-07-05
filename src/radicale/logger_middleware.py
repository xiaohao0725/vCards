"""Radicale WSGI 日志中间件 — 采集所有 CardDAV 请求"""

import os, json, time
from logs_sdk import LogSDK
from logs_sdk.types import new_uuid, sanitize_headers, LogEntry

logger = LogSDK(
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


class LogsMiddleware:
    """WSGI 中间件，采集所有请求/响应的日志"""

    def __init__(self, app):
        self.app = app

    def __getattr__(self, name):
        return getattr(self.app, name)

    def __call__(self, environ, start_response):
        entry_uuid = new_uuid()
        start_time = time.time()
        status_code = [200]
        response_headers = [("Content-Type", "text/plain")]

        def _start_response(status, headers, exc_info=None):
            status_code[0] = int(status.split()[0])
            response_headers[0] = headers
            return start_response(status, headers, exc_info)

        try:
            result = self.app(environ, _start_response)
            body_chunks = []
            for chunk in result:
                body_chunks.append(
                    chunk if isinstance(chunk, bytes) else chunk.encode()
                )
                yield chunk
            resp_body = b"".join(body_chunks).decode("utf-8", errors="replace")
        except Exception:
            status_code[0] = 500
            resp_body = ""

        duration_ms = int((time.time() - start_time) * 1000)

        scheme = environ.get("wsgi.url_scheme", "https")
        host = environ.get("HTTP_HOST", "")
        path = environ.get("PATH_INFO", "")
        qs = environ.get("QUERY_STRING", "")
        full_url = f"{scheme}://{host}{path}"
        if qs:
            full_url += f"?{qs}"

        req_headers = {}
        for k, v in environ.items():
            if k.startswith("HTTP_"):
                name = k[5:].replace("_", "-").title()
                req_headers[name] = v
        if environ.get("CONTENT_TYPE"):
            req_headers["Content-Type"] = environ["CONTENT_TYPE"]
        if environ.get("CONTENT_LENGTH"):
            req_headers["Content-Length"] = environ["CONTENT_LENGTH"]

        req_body = ""
        try:
            length = int(environ.get("CONTENT_LENGTH", 0))
            if length > 0:
                req_body = (
                    environ["wsgi.input"].read(length).decode("utf-8", errors="replace")
                )
        except Exception:
            pass

        resp_headers_dict = {k: v for k, v in response_headers[0]}

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
            request_body=req_body[: logger.config.max_body_size],
            request_body_size=len(req_body),
            content_type=req_headers.get("Content-Type", ""),
            status_code=status_code[0],
            response_headers=sanitize_headers(resp_headers_dict),
            response_body=resp_body[: logger.config.max_body_size],
            response_body_size=len(resp_body),
            client_ip=environ.get("HTTP_X_REAL_IP", environ.get("REMOTE_ADDR", "")),
            client_ip_chain=environ.get("HTTP_X_FORWARDED_FOR", ""),
            client_type="other",
            user_agent=req_headers.get("User-Agent", ""),
            is_error=status_code[0] >= 500,
            error_message=f"HTTP {status_code[0]}" if status_code[0] >= 500 else "",
            error_type="http_error" if status_code[0] >= 500 else "",
        )
        logger.send(entry)
