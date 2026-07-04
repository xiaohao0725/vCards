import bcrypt from 'bcryptjs'
import prisma from '../services/prisma.js'
import { signToken } from '../middleware/authMiddleware.js'

export default async function authRoutes(fastify) {
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body || {}

    if (!username || !password) {
      return reply.code(400).send({ error: '用户名和密码不能为空' })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      return reply.code(401).send({ error: '用户名或密码错误' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: '用户名或密码错误' })
    }

    const token = signToken(user.id, user.username)
    return { token, username: user.username }
  })
}
