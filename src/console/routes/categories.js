import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const MAX_DEPTH = 5

function buildTree(categories) {
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
}

async function getAncestorIds(categoryId) {
  const ids = []
  let currentId = categoryId
  while (currentId) {
    const cat = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    })
    if (!cat || !cat.parentId) break
    ids.push(cat.parentId)
    currentId = cat.parentId
  }
  return ids
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

async function getDepth(categoryId) {
  let depth = 1
  let currentId = categoryId
  while (currentId) {
    const cat = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    })
    if (!cat || !cat.parentId) break
    depth++
    currentId = cat.parentId
  }
  return depth
}

async function getCategoryPath(categoryId) {
  const parts = []
  let currentId = categoryId
  while (currentId) {
    const cat = await prisma.category.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true }
    })
    if (!cat) break
    parts.unshift(cat.name)
    currentId = cat.parentId
  }
  return parts
}

export default async function categoriesRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  fastify.get('/categories', async (request, reply) => {
    const { parentId, tree } = request.query

    const where = {}
    if (parentId !== undefined) {
      where.parentId = parentId === '' || parentId === 'null' ? null : Number(parentId)
    }

    const categories = await prisma.category.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { contacts: true } } }
    })

    if (tree === 'true') {
      return buildTree(categories)
    }
    return categories
  })

  fastify.get('/categories/:id/path', async (request, reply) => {
    const id = Number(request.params.id)
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '分类不存在' })

    const path = await getCategoryPath(id)
    return { id, path, pathString: path.join('»') }
  })

  fastify.get('/categories/:id/descendants', async (request, reply) => {
    const id = Number(request.params.id)
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '分类不存在' })

    const descendants = await getDescendantIds(id)
    return { id, descendantIds: descendants, count: descendants.length }
  })

  fastify.post('/categories', async (request, reply) => {
    const { name, parentId, sortOrder } = request.body || {}
    if (!name?.trim()) {
      return reply.code(400).send({ error: '分类名称不能为空' })
    }

    const nameTrimmed = name.trim()
    if (parentId !== undefined && parentId !== null) {
      const parent = await prisma.category.findUnique({ where: { id: Number(parentId) } })
      if (!parent) return reply.code(400).send({ error: '父分类不存在' })

      const depth = await getDepth(Number(parentId))
      if (depth >= MAX_DEPTH) {
        return reply.code(400).send({ error: `分类层级不能超过 ${MAX_DEPTH} 级` })
      }
    }

    const existing = await prisma.category.findUnique({ where: { name: nameTrimmed } })
    if (existing) {
      return reply.code(409).send({ error: `分类「${nameTrimmed}」已存在` })
    }

    const category = await prisma.category.create({
      data: {
        name: nameTrimmed,
        parentId: parentId != null ? Number(parentId) : null,
        sortOrder: sortOrder ?? 999
      },
      include: { _count: { select: { contacts: true } } }
    })

    return reply.code(201).send(category)
  })

  fastify.put('/categories/:id', async (request, reply) => {
    const id = Number(request.params.id)
    const { name, parentId, sortOrder } = request.body || {}

    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: '分类不存在' })

    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (sortOrder !== undefined) data.sortOrder = sortOrder

    if (parentId !== undefined) {
      const newParentId = parentId === null ? null : Number(parentId)

      if (newParentId !== null) {
        if (newParentId === id) {
          return reply.code(400).send({ error: '不能将分类移动到自身' })
        }

        // 校验新父级不是当前分类的子分类（防止循环引用）
        const descendants = await getDescendantIds(id)
        if (descendants.includes(newParentId)) {
          return reply.code(400).send({ error: '不能移动到子分类下，会产生循环引用' })
        }

        const parent = await prisma.category.findUnique({ where: { id: newParentId } })
        if (!parent) return reply.code(400).send({ error: '目标父分类不存在' })

        const depth = await getDepth(newParentId)
        if (depth >= MAX_DEPTH) {
          return reply.code(400).send({ error: `分类层级不能超过 ${MAX_DEPTH} 级` })
        }
      }

      data.parentId = newParentId
    }

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
      include: {
        _count: { select: { contacts: true, children: true } }
      }
    })
    if (!existing) return reply.code(404).send({ error: '分类不存在' })

    // 处理子分类：提升到祖父级
    if (existing._count.children > 0) {
      const grandParentId = existing.parentId
      await prisma.category.updateMany({
        where: { parentId: id },
        data: { parentId: grandParentId }
      })
    }

    // 处理联系人：迁移到目标分类或清空关联
    if (existing._count.contacts > 0) {
      if (!migrateTo) {
        return reply.code(400).send({
          error: '该分类下存在联系人，请指定迁移目标分类（?migrateTo=目标ID）',
          contactCount: existing._count.contacts
        })
      }

      const targetId = Number(migrateTo)
      const target = await prisma.category.findUnique({ where: { id: targetId } })
      if (!target) return reply.code(400).send({ error: '目标分类不存在' })

      await prisma.contactCategory.updateMany({
        where: { categoryId: id },
        data: { categoryId: targetId }
      })
    }

    await prisma.category.delete({ where: { id } })

    return {
      success: true,
      migratedContacts: existing._count.contacts,
      promotedChildren: existing._count.children
    }
  })
}
