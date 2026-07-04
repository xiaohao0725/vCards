import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const contactInclude = {
  category: true,
  phones: { orderBy: { sortOrder: 'asc' } },
  emails: { orderBy: { sortOrder: 'asc' } }
}

export default async function contactsRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  // 列表
  fastify.get('/contacts', async (request, reply) => {
    const { search, categoryId, status, page = 1, pageSize = 20 } = request.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)

    const where = {}
    if (status) where.status = status
    if (categoryId) where.categoryId = Number(categoryId)
    if (search) {
      where.OR = [
        { organization: { contains: search, mode: 'insensitive' } },
        { phones: { some: { number: { contains: search } } } }
      ]
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: contactInclude,
        orderBy: { updatedAt: 'desc' },
        skip,
        take
      }),
      prisma.contact.count({ where })
    ])

    return { contacts, total, page: Number(page), pageSize: take }
  })

  // 详情
  fastify.get('/contacts/:id', async (request, reply) => {
    const contact = await prisma.contact.findUnique({
      where: { id: Number(request.params.id) },
      include: contactInclude
    })
    if (!contact) return reply.code(404).send({ error: '联系人不存在' })
    return contact
  })

  // 创建
  fastify.post('/contacts', async (request, reply) => {
    const { organization, categoryId, url, imagePath, phones, emails } = request.body || {}

    if (!organization) {
      return reply.code(400).send({ error: '组织名称不能为空' })
    }

    const contact = await prisma.contact.create({
      data: {
        organization,
        categoryId: categoryId ? Number(categoryId) : null,
        url: url || null,
        imagePath: imagePath || null,
        phones: phones?.length ? {
          create: phones.map((p, i) => ({
            number: p.number,
            label: p.label || null,
            sortOrder: i
          }))
        } : undefined,
        emails: emails?.length ? {
          create: emails.map((e, i) => ({
            email: e.email,
            label: e.label || null,
            sortOrder: i
          }))
        } : undefined
      },
      include: contactInclude
    })

    return reply.code(201).send(contact)
  })

  // 更新
  fastify.put('/contacts/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const { organization, categoryId, url, imagePath, phones, emails, status } = request.body || {}

    const existing = await prisma.contact.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '联系人不存在' })

    // 删除旧的关联数据
    if (phones !== undefined) {
      await prisma.contactPhone.deleteMany({ where: { contactId: id } })
    }
    if (emails !== undefined) {
      await prisma.contactEmail.deleteMany({ where: { contactId: id } })
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        organization: organization ?? existing.organization,
        categoryId: categoryId !== undefined ? Number(categoryId) : existing.categoryId,
        url: url !== undefined ? url : existing.url,
        imagePath: imagePath !== undefined ? imagePath : existing.imagePath,
        status: status ?? existing.status,
        phones: phones?.length ? {
          create: phones.map((p, i) => ({
            number: p.number,
            label: p.label || null,
            sortOrder: i
          }))
        } : undefined,
        emails: emails?.length ? {
          create: emails.map((e, i) => ({
            email: e.email,
            label: e.label || null,
            sortOrder: i
          }))
        } : undefined
      },
      include: contactInclude
    })

    return contact
  })

  // 删除
  fastify.delete('/contacts/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const existing = await prisma.contact.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '联系人不存在' })

    await prisma.contact.delete({ where: { id } })
    return { success: true }
  })

  // 批量发布
  fastify.post('/contacts/publish-all', async (request, reply) => {
    const result = await prisma.contact.updateMany({
      where: { status: 'draft' },
      data: { status: 'published' }
    })
    return { published: result.count }
  })
}
