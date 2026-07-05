import fs from 'node:fs'
import path from 'node:path'
import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { generateVcfFromContact, getCategoryPaths, VCF_OUTPUT_DIR } from '../services/vcfGenerator.js'

const contactInclude = {
  categories: {
    include: {
      category: true
    }
  },
  phones: { orderBy: { sortOrder: 'asc' } },
  emails: { orderBy: { sortOrder: 'asc' } }
}

async function getDescendantIds(categoryId) {
  const result = []
  const stack = [categoryId]
  while (stack.length > 0) {
    const id = stack.pop()
    const children = await prisma.category.findMany({
      where: { parentId: id },
      select: { id: true }
    })
    for (const child of children) {
      result.push(child.id)
      stack.push(child.id)
    }
  }
  return result
}

export default async function contactsRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  // 列表
  fastify.get('/contacts', async (request, reply) => {
    const { search, categoryId, categoryIds, includeChildren, status, page = 1, pageSize = 20 } = request.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)

    const where = {}
    if (status) where.status = status

    // 支持单分类和多分类筛选
    let filterCategoryIds = []
    if (categoryIds) {
      filterCategoryIds = String(categoryIds).split(',').map(Number).filter(Boolean)
    } else if (categoryId) {
      filterCategoryIds = [Number(categoryId)]
    }

    if (filterCategoryIds.length > 0) {
      if (includeChildren === 'true') {
        // 包含所有子分类
        const allIds = new Set(filterCategoryIds)
        for (const cid of filterCategoryIds) {
          const descendants = await getDescendantIds(cid)
          for (const did of descendants) {
            allIds.add(did)
          }
        }
        where.categories = { some: { categoryId: { in: [...allIds] } } }
      } else {
        where.categories = { some: { categoryId: { in: filterCategoryIds } } }
      }
    }

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
    const { organization, categoryIds: catIds, url, imagePath, phones, emails } = request.body || {}

    if (!organization) {
      return reply.code(400).send({ error: '组织名称不能为空' })
    }

    const categoryIds = catIds?.length ? [...new Set(catIds.map(Number))] : []

    if (categoryIds.length > 0) {
      const existingCats = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true }
      })
      if (existingCats.length !== categoryIds.length) {
        return reply.code(400).send({ error: '部分分类不存在' })
      }
    }

    const contact = await prisma.contact.create({
      data: {
        organization,
        url: url || null,
        imagePath: imagePath || null,
        categories: categoryIds.length > 0 ? {
          create: categoryIds.map(cid => ({ categoryId: cid }))
        } : undefined,
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
    const { organization, categoryIds: catIds, url, imagePath, phones, emails, status } = request.body || {}

    const existing = await prisma.contact.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '联系人不存在' })

    // 更新分类关联
    if (catIds !== undefined) {
      const categoryIds = catIds.length ? [...new Set(catIds.map(Number))] : []

      if (categoryIds.length > 0) {
        const existingCats = await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true }
        })
        if (existingCats.length !== categoryIds.length) {
          return reply.code(400).send({ error: '部分分类不存在' })
        }
      }

      await prisma.contactCategory.deleteMany({ where: { contactId: id } })
      if (categoryIds.length > 0) {
        await prisma.contactCategory.createMany({
          data: categoryIds.map(cid => ({ contactId: id, categoryId: cid }))
        })
      }
    }

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

    // 已发布的联系人自动重新生成 VCF
    if (contact.status === 'published') {
      try {
        contact._categoryPaths = await getCategoryPaths(contact)
        const vcfString = await generateVcfFromContact(contact)
        const sanitizedName = contact.organization.replace(/[<>:"/\\|?*]/g, '_')
        const vcfPath = path.join(VCF_OUTPUT_DIR, `${sanitizedName}.vcf`)
        fs.mkdirSync(VCF_OUTPUT_DIR, { recursive: true })
        fs.writeFileSync(vcfPath, vcfString, 'utf-8')
      } catch (err) {
        fastify.log.warn(`VCF 更新失败: ${contact.organization} - ${err.message}`)
      }
    }

    return contact
  })

  // 删除
  fastify.delete('/contacts/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const existing = await prisma.contact.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '联系人不存在' })

    await prisma.contact.delete({ where: { id } })

    // 删除对应的 VCF 文件
    try {
      const sanitizedName = existing.organization.replace(/[<>:"/\\|?*]/g, '_')
      const vcfPath = path.join(VCF_OUTPUT_DIR, `${sanitizedName}.vcf`)
      if (fs.existsSync(vcfPath)) {
        fs.unlinkSync(vcfPath)
      }
    } catch {
      // ignore
    }

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
