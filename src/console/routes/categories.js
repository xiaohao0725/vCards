import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

export default async function categoriesRoutes(fastify) {
  fastify.get('/categories', async (request, reply) => {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { contacts: true } } }
    })
    return categories
  })
}
