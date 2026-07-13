import { LogSDK, newLogUUID } from '@xiaohao0725/logs-sdk'

export const logger = new LogSDK({
  endpoint: process.env.LOGS_ENDPOINT || 'https://api.logs.codexs.cn/api/v1/ingest/logs',
  apiKey: process.env.LOGS_API_KEY || '',
  apiSecret: process.env.LOGS_API_SECRET || '',
  projectSlug: 'vcards',
  environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  serviceName: 'console',
  bufferSize: 100,
  flushInterval: 3,
  maxBodySize: 4096,
})

function sanitizeHeaders(headers) {
  const safe = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null) continue
    const val = Array.isArray(v) ? v.join(', ') : String(v)
    if (['authorization', 'cookie', 'set-cookie'].includes(k.toLowerCase())) {
      safe[k] = val.length > 20 ? val.slice(0, 15) + '...' : '***'
      continue
    }
    safe[k] = val
  }
  return JSON.stringify(safe)
}

function truncate(s, maxLen) {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen) + '...[truncated]'
}

function detectClientType(request) {
  const ct = request.headers['x-client-type']
  if (ct) return ct
  const ua = (request.headers['user-agent'] || '').toLowerCase()
  if (ua.includes('micromessenger') || ua.includes('miniprogram')) return 'miniprogram'
  if (request.headers['x-caller-service']) return 'server'
  const referer = request.headers.referer
  const origin = request.headers.origin
  if ((referer || origin) && (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari') || ua.includes('firefox'))) {
    return 'web'
  }
  return 'other'
}

function detectOrigin(request) {
  switch (detectClientType(request)) {
    case 'web': return request.headers.referer || request.headers.origin || ''
    case 'miniprogram': return `miniprogram:${request.headers['x-miniprogram-appid'] || ''}${request.headers['x-miniprogram-path'] || ''}`
    case 'app': return `app:${request.headers['x-app-name'] || ''}/${request.headers['x-app-version'] || ''}/${request.headers['x-app-scene'] || ''}`
    case 'server': return `server:${request.headers['x-caller-service'] || ''}/${request.headers['x-caller-version'] || ''}`
    default: return 'unknown'
  }
}

function extractAPIVersion(path) {
  if (!path) return ''
  const m = path.match(/\/api\/(v\d+)\//)
  return m ? m[1] : ''
}

function buildEntry(request, reply, uuid, startTime, durationMs, reqBody, respBody) {
  const config = logger.configResolved
  const scheme = request.protocol
  const fullURL = `${scheme}://${request.hostname}${request.url}`
  const clientType = detectClientType(request)

  return {
    uuid,
    uid: 0,
    timestamp: new Date(startTime).toISOString(),
    duration_ms: Math.round(durationMs),
    project_slug: config.projectSlug,
    environment: config.environment,
    service_name: config.serviceName || '',
    host: logger.host,
    process_id: String(process.pid),
    method: request.method,
    scheme,
    full_url: fullURL,
    host_header: request.hostname || '',
    path: request.routeOptions?.url || request.url.split('?')[0],
    query_string: JSON.stringify(request.query),
    origin: detectOrigin(request),
    request_headers: sanitizeHeaders(request.headers),
    request_body: truncate(reqBody, config.maxBodySize),
    request_body_size: Buffer.byteLength(reqBody),
    content_type: request.headers['content-type'] || '',
    status_code: reply.statusCode,
    response_headers: sanitizeHeaders(reply.getHeaders()),
    response_body: truncate(respBody, config.maxBodySize),
    response_body_size: Buffer.byteLength(respBody),
    client_ip: request.ip,
    client_ip_chain: request.headers['x-forwarded-for'] || '',
    client_type: clientType,
    client_port: 0,
    client_country: '',
    client_province: '',
    client_city: '',
    client_isp: '',
    user_agent: request.headers['user-agent'] || '',
    device_type: '',
    browser: '',
    browser_version: '',
    os_name: '',
    os_version: '',
    tls_version: request.raw?.socket?.getProtocol?.() || '',
    tls_cipher: request.raw?.socket?.getCipher?.()?.name || '',
    proto: request.raw?.httpVersion || '1.1',
    api_version: extractAPIVersion(request.routeOptions?.url || request.url),
    referer: request.headers.referer || '',
    upstream_status: 0,
    latency_breakdown: '{}',
    request_id: uuid.slice(0, 8),
    trace_id: request.headers['x-trace-id'] || uuid,
    span_id: uuid,
    parent_span_id: request.headers['x-parent-span-id'] || '',
    user_id: request.headers['x-user-id'] || '',
    session_id: request.headers['x-session-id'] || '',
    is_error: reply.statusCode >= 500,
    error_message: reply.statusCode >= 500 ? `HTTP ${reply.statusCode}` : '',
    error_type: reply.statusCode >= 500 ? 'http_error' : '',
    error_stack: '',
    panic_location: '',
    tags: {},
  }
}

function panicEntry(request, reply, uuid, startTime, error) {
  const config = logger.configResolved
  const scheme = request.protocol
  const fullURL = `${scheme}://${request.hostname}${request.url}`
  const clientType = detectClientType(request)

  return {
    uuid,
    uid: 0,
    timestamp: new Date(startTime).toISOString(),
    duration_ms: 0,
    project_slug: config.projectSlug,
    environment: config.environment,
    service_name: config.serviceName || '',
    host: logger.host,
    process_id: String(process.pid),
    method: request.method,
    scheme,
    full_url: fullURL,
    host_header: request.hostname || '',
    path: request.routeOptions?.url || request.url.split('?')[0],
    query_string: JSON.stringify(request.query),
    origin: detectOrigin(request),
    request_headers: sanitizeHeaders(request.headers),
    request_body: '',
    request_body_size: 0,
    content_type: request.headers['content-type'] || '',
    status_code: 0,
    response_headers: '{}',
    response_body: '',
    response_body_size: 0,
    client_ip: request.ip,
    client_ip_chain: request.headers['x-forwarded-for'] || '',
    client_type: clientType,
    client_port: 0,
    client_country: '',
    client_province: '',
    client_city: '',
    client_isp: '',
    user_agent: request.headers['user-agent'] || '',
    device_type: '',
    browser: '',
    browser_version: '',
    os_name: '',
    os_version: '',
    tls_version: request.raw?.socket?.getProtocol?.() || '',
    tls_cipher: request.raw?.socket?.getCipher?.()?.name || '',
    proto: request.raw?.httpVersion || '1.1',
    api_version: extractAPIVersion(request.routeOptions?.url || request.url),
    referer: request.headers.referer || '',
    upstream_status: 0,
    latency_breakdown: '{}',
    request_id: uuid.slice(0, 8),
    trace_id: request.headers['x-trace-id'] || uuid,
    span_id: uuid,
    parent_span_id: request.headers['x-parent-span-id'] || '',
    user_id: request.headers['x-user-id'] || '',
    session_id: request.headers['x-session-id'] || '',
    is_error: true,
    error_message: error?.message || String(error),
    error_type: 'panic',
    error_stack: error?.stack || '',
    panic_location: '',
    tags: {},
  }
}

export async function logsPlugin(fastify) {
  fastify.decorateRequest('_logsStartTime', 0)
  fastify.decorateRequest('_logsStartHrTime', 0)
  fastify.decorateRequest('_logsUUID', '')

  fastify.addHook('onRequest', async (request) => {
    request._logsStartTime = Date.now()
    request._logsStartHrTime = process.hrtime.bigint()
    request._logsUUID = newLogUUID()
  })

  fastify.addHook('onSend', async (request, reply, payload) => {
    const startTime = request._logsStartTime
    const startHrTime = request._logsStartHrTime
    const entryUUID = request._logsUUID

    if (!startTime) return payload

    const durationMs = Number(process.hrtime.bigint() - startHrTime) / 1_000_000

    let reqBody = ''
    try {
      if (request.body) {
        reqBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
      }
    } catch { /* ignore */ }

    let respBody = ''
    try {
      if (typeof payload === 'string') respBody = payload
      else if (Buffer.isBuffer(payload)) respBody = payload.toString('utf-8')
      else if (payload) respBody = JSON.stringify(payload)
    } catch { /* ignore */ }

    const entry = buildEntry(request, reply, entryUUID, startTime, durationMs, reqBody, respBody)
    logger.send(entry)
    return payload
  })

  fastify.addHook('onError', async (request, reply, error) => {
    const startTime = request._logsStartTime
    const entryUUID = request._logsUUID
    if (!startTime || !entryUUID) return
    const entry = panicEntry(request, reply, entryUUID, startTime, error)
    logger.send(entry)
  })

  fastify.addHook('onClose', async () => {
    await logger.close()
  })

  console.log('[logs-sdk] 日志插件已挂载')
}
