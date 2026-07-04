import { authMiddleware } from '../middleware/authMiddleware.js'
import { uploadImage } from '../services/qiniu.js'
import crypto from 'node:crypto'

export default async function uploadRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  fastify.post('/upload/image', async (request, reply) => {
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: '未提供文件' })

    // 验证文件类型
    if (!file.mimetype.startsWith('image/')) {
      return reply.code(400).send({ error: '仅支持图片文件' })
    }

    const buffer = await file.toBuffer()
    const ext = file.filename.split('.').pop() || 'png'
    const id = crypto.randomUUID()
    const fileName = `${id}.${ext}`

    const result = await uploadImage(buffer, fileName)
    return { url: result.url, key: result.key }
  })
}
