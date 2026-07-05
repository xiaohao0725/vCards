#!/usr/bin/env node

import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 自动适配本地开发（../public）和 Docker 部署（./public）两种目录结构
function resolvePublicDir(dirName) {
  const localPath = path.resolve(__dirname, dirName)
  if (existsSync(localPath)) return localPath
  const parentPath = path.resolve(__dirname, '..', dirName)
  if (existsSync(parentPath)) return parentPath
  return localPath
}

const PUBLIC_DIR = resolvePublicDir('public')
const WEB_PUBLIC_DIR = resolvePublicDir('public-web')
const PORT = process.env.PORT || 3000
const CONSOLE_API_HOST = process.env.CONSOLE_API_HOST || 'localhost'
const CONSOLE_API_PORT = process.env.CONSOLE_API_PORT || 3001

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.vcf': 'text/vcard'
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return mimeTypes[ext] || 'application/octet-stream'
}

function proxyApiRequest(req, res) {
  const options = {
    host: CONSOLE_API_HOST,
    port: CONSOLE_API_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${CONSOLE_API_HOST}:${CONSOLE_API_PORT}` }
  }

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error(`代理请求失败 ${req.url}:`, err.message)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'API 服务不可用' }))
  })

  req.pipe(proxyReq)
}

function serveStaticFile(res, filePath) {
  readFile(filePath)
    .then((content) => {
      res.writeHead(200, {
        'Content-Type': getMimeType(filePath),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      })
      res.end(content)
    })
    .catch((err) => {
      console.error(`读取文件失败: ${filePath}`, err.message)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    })
}

const server = createServer((req, res) => {
  try {
    let reqPath = req.url.split('?')[0]
    reqPath = decodeURIComponent(reqPath)

    if (reqPath.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }

    // API 请求代理到 Console 后端
    if (reqPath.startsWith('/console/api/')) {
      proxyApiRequest(req, res)
      return
    }

    // /web/ 路径从 public-web/ 目录提供静态文件
    if (reqPath.startsWith('/web/')) {
      let webPath = reqPath.replace(/^\/web/, '') || '/'
      if (webPath === '/') webPath = '/index.html'
      const fullPath = path.join(WEB_PUBLIC_DIR, webPath)

      if (existsSync(fullPath)) {
        serveStaticFile(res, fullPath)
        return
      }

      // 网页版 SPA fallback：未匹配路径返回 index.html
      const indexFallback = path.join(WEB_PUBLIC_DIR, 'index.html')
      if (existsSync(indexFallback)) {
        serveStaticFile(res, indexFallback)
        return
      }
    }

    // 默认路径从 public/ 目录提供静态文件
    let filePath = reqPath === '/' ? '/index.html' : reqPath
    const fullPath = path.join(PUBLIC_DIR, filePath)

    if (!existsSync(fullPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('File not found')
      return
    }

    serveStaticFile(res, fullPath)
  } catch (error) {
    console.error('请求处理错误:', error)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal Server Error')
  }
})

server.listen(PORT, () => {
  console.log(`🚀 vCards 服务运行在: http://localhost:${PORT}`)
  console.log(`📁 Console 静态目录: ${PUBLIC_DIR}`)
  console.log(`📁 网页版静态目录: ${WEB_PUBLIC_DIR}`)
  console.log(`🔗 API 代理目标: http://${CONSOLE_API_HOST}:${CONSOLE_API_PORT}`)
  console.log('按 Ctrl+C 停止服务器')
})

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...')
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })
})
