import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

export default async function categoriesRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  fastify.get('/categories', async (request, reply) => {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { contacts: true } } }
    })
    return categories
  })

  fastify.post('/categories', async (request, reply) => {
    const { name, sortOrder } = request.body || {}
    if (!name?.trim()) {
      return reply.code(400).send({ error: '分类名称不能为空' })
    }

    const existing = await prisma.category.findUnique({ where: { name: name.trim() } })
    if (existing) {
      return reply.code(409).send({ error: `分类「${name}」已存在` })
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        sortOrder: sortOrder ?? 999
      },
      include: { _count: { select: { contacts: true } } }
    })

    return reply.code(201).send(category)
  })

  fastify.put('/categories/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const { name, sortOrder } = request.body || {}

    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '分类不存在' })

    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (sortOrder !== undefined) data.sortOrder = sortOrder

    const category = await prisma.category.update({
      where: { id },
      data,
      include: { _count: { select: { contacts: true } } }
    })

    return category
  })

  fastify.delete('/categories/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const { migrateTo } = request.query

    const existing = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { contacts: true } } }
    })
    if (!existing) return reply.code(404).send({ error: '分类不存在' })

    // 如果有联系人需要迁移
    if (existing._count.contacts > 0) {
      if (!migrateTo) {
        return reply.code(400).send({
          error: '该分类下存在联系人，请指定迁移目标分类',
          contactCount: existing._count.contacts
        })
      }

      const targetId = Number(migrateTo)
      const target = await prisma.category.findUnique({ where: { id: targetId } })
      if (!target) return reply.code(400).send({ error: '目标分类不存在' })

      // 迁移联系人
      await prisma.contact.updateMany({
        where: { categoryId: id },
        data: { categoryId: targetId }
      })
    }

    await prisma.category.delete({ where: { id } })

    return { success: true, migrated: existing._count.contacts }
  })
}
