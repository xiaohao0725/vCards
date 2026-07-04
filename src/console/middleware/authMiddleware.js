import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production'

export function signToken(userId, username) {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '24h' })
}

export async function authMiddleware(request, reply) {
  let token = request.query.token || ''

  if (!token) {
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1]
    }
  }

  if (!token) {
    reply.code(401).send({ error: '未授权访问' })
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    request.user = decoded
  } catch {
    reply.code(401).send({ error: 'Token 无效或已过期' })
  }
}
