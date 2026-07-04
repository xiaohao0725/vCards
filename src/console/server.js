import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import staticFiles from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/auth.js'
import contactsRoutes from './routes/contacts.js'
import categoriesRoutes from './routes/categories.js'
import vcfRoutes from './routes/vcf.js'
import uploadRoutes from './routes/upload.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.CONSOLE_PORT || 3001

async function buildServer() {
  const server = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 })

  await server.register(cors, { origin: true, credentials: true })
  await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } })

  const publicDir = path.resolve(__dirname, '../../public/console')
  await server.register(staticFiles, { root: publicDir, prefix: '/console/' })

  await server.register(authRoutes, { prefix: '/console/api/auth' })
  await server.register(contactsRoutes, { prefix: '/console/api' })
  await server.register(categoriesRoutes, { prefix: '/console/api' })
  await server.register(vcfRoutes, { prefix: '/console/api' })
  await server.register(uploadRoutes, { prefix: '/console/api' })

  server.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/console/api/')) {
      reply.code(404).send({ error: '接口不存在' })
    } else {
      reply.sendFile('index.html')
    }
  })

  return server
}

async function start() {
  const server = await buildServer()
  try {
    await server.listen({ host: '0.0.0.0', port: PORT })
    console.log(`Console 服务运行在 http://0.0.0.0:${PORT}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
