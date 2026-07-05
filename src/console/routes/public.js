import prisma from '../services/prisma.js'
import { getCategoryPaths } from '../services/vcfGenerator.js'

export default async function publicRoutes(fastify) {
  // 公开搜索/列表（无需认证）
  fastify.get('/public/contacts', async (request, reply) => {
    const { search, categoryId, includeChildren, page = 1, pageSize = 20 } = request.query
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Math.min(Number(pageSize), 50)

    const where = { status: 'published' }

    if (search) {
      where.OR = [
        { organization: { contains: search, mode: 'insensitive' } },
        { phones: { some: { number: { contains: search } } } }
      ]
    }

    if (categoryId) {
      let ids = [Number(categoryId)]
      if (includeChildren === 'true') {
        const descendants = await getDescendantIds(Number(categoryId))
        ids.push(...descendants)
      }
      where.categories = { some: { categoryId: { in: ids } } }
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          categories: { include: { category: true } },
          phones: { orderBy: { sortOrder: 'asc' } },
          emails: { orderBy: { sortOrder: 'asc' } }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take
      }),
      prisma.contact.count({ where })
    ])

    // 计算分类路径
    const items = await Promise.all(contacts.map(async (c) => {
      const paths = await getCategoryPaths(c)
      return {
        id: c.id,
        organization: c.organization,
        url: c.url,
        imagePath: c.imagePath,
        categoryPaths: paths,
        phones: c.phones,
        emails: c.emails
      }
    }))

    return { contacts: items, total, page: Number(page), pageSize: take }
  })

  // 公开分类树
  fastify.get('/public/categories', async () => {
    const categories = await prisma.category.findMany({
      where: { contacts: { some: { contact: { status: 'published' } } } },
      orderBy: { sortOrder: 'asc' }
    })

    const map = {}
    const roots = []
    for (const cat of categories) {
      map[cat.id] = { ...cat, children: [] }
    }
    for (const cat of categories) {
      if (cat.parentId && map[cat.parentId]) {
        map[cat.parentId].children.push(map[cat.id])
      } else {
        roots.push(map[cat.id])
      }
    }
    return roots
  })
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
