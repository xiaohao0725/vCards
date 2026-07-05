import fs from 'node:fs'
import path from 'node:path'
import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { generateVcfFromContact, generateAllVcfFiles, getCategoryPaths } from '../services/vcfGenerator.js'
import { uploadImage } from '../services/qiniu.js'

const VCF_OUTPUT_DIR = process.env.VCF_OUTPUT_DIR || '/app/vcards-data'

function parseCategoryPaths(note, categoriesValue) {
  const paths = []

  // 从 NOTE 解析路径
  if (note) {
    const noteMatch = note.match(/(?:分类路径|覆盖地区):\s*(.+)/i)
    if (noteMatch) {
      const parts = noteMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      for (const p of parts) {
        paths.push(p.replace(/\s*»\s*/g, '»').trim())
      }
    }
  }

  // 从 CATEGORIES 解析路径（兜底）
  if (!paths.length && categoriesValue) {
    const parts = categoriesValue.split(',').map(s => s.trim()).filter(Boolean)
    for (const p of parts) {
      if (p.includes('»')) {
        paths.push(p)
      }
    }
  }

  return paths
}

function parseVcfContent(content) {
  const contacts = []
  const vcardBlocks = content.split(/END:VCARD\s*/i)

  for (const block of vcardBlocks) {
    if (!block.trim() || !block.includes('BEGIN:VCARD')) continue

    const organization = (block.match(/(?:^|\n)ORG(?:;[^:]*)?:(.+)/im)?.[1] || block.match(/(?:^|\n)FN(?:;[^:]*)?:(.+)/im)?.[1] || '未知组织').trim()

    // PHOTO — 提取 base64/URL
    let photo = null
    const photoMatch = block.match(/PHOTO(?:;[^:]*)?:(.+)/i)
    if (photoMatch) {
      const val = photoMatch[1].trim()
      const encMatch = block.match(/PHOTO;ENCODING=([^;:]+)/i)
      const typeMatch = block.match(/PHOTO(?:;.*)?;TYPE=(\w+)/i) || block.match(/PHOTO;([^;:]+);TYPE=(\w+)/i)
      const mimeType = typeMatch?.[2] || typeMatch?.[1] || 'PNG'
      const encoding = encMatch?.[1]?.toUpperCase()

      if (val.startsWith('http')) {
        photo = { url: val, mimeType: mimeType.toLowerCase() }
      } else {
        const data = val.replace(/\s/g, '')
        if (data.length > 20) {
          photo = { data: `data:image/${mimeType.toLowerCase()};base64,${data}`, mimeType: mimeType.toLowerCase() }
        }
      }
    }

    // 电话 — 带标签解析
    const phones = []
    const telRegex = /TEL;TYPE=([^:]*):(.+)/gi
    let telMatch
    while ((telMatch = telRegex.exec(block)) !== null) {
      const label = telMatch[1].split(',')[0].trim().toLowerCase()
      const labelMap = { work: '工作', home: '家庭', cell: '手机', main: '主要', fax: '传真' }
      phones.push({ number: telMatch[2].trim(), label: labelMap[label] || label })
    }

    // 普通电话（无 TYPE）
    const simpleTelRegex = /^(?!.*;)(?!item)TEL(?:;[^:]*)?:(.+)/gim
    let simpleMatch
    while ((simpleMatch = simpleTelRegex.exec(block)) !== null) {
      const num = simpleMatch[1].trim()
      if (!phones.find(p => p.number === num)) {
        phones.push({ number: num, label: '' })
      }
    }

    // Apple 格式标签电话: itemN.TEL + X-ABLabel
    const applePhoneRegex = /item(\d+)\.TEL(?:;[^:]*)?:(.+)/gi
    let appleMatch
    while ((appleMatch = applePhoneRegex.exec(block)) !== null) {
      const itemId = appleMatch[1]
      const num = appleMatch[2].trim()
      const labelRegex = new RegExp(`item${itemId}\\.X-ABLabel:(.+)`, 'i')
      const labelMatch = block.match(labelRegex)
      const label = labelMatch?.[1]?.trim() || ''
      if (!phones.find(p => p.number === num)) {
        phones.push({ number: num, label })
      }
    }

    // 邮箱 — 带标签解析
    const emails = []
    const emailRegex = /EMAIL;TYPE=([^:]*):(.+)/gi
    let emailMatch
    while ((emailMatch = emailRegex.exec(block)) !== null) {
      const label = emailMatch[1].split(',')[0].trim().toLowerCase()
      const labelMap = { work: '工作', home: '家庭', internet: '个人' }
      emails.push({ email: emailMatch[2].trim(), label: labelMap[label] || label })
    }

    // 普通邮箱（无 TYPE）
    const simpleEmailRegex = /^(?!.*;)(?!item)EMAIL(?:;[^:]*)?:(.+)/gim
    let simpleEMatch
    while ((simpleEMatch = simpleEmailRegex.exec(block)) !== null) {
      const em = simpleEMatch[1].trim()
      if (!emails.find(e => e.email === em)) {
        emails.push({ email: em, label: '' })
      }
    }

    // Apple 格式标签邮箱: itemN.EMAIL + X-ABLabel
    const appleEmailRegex = /item(\d+)\.EMAIL(?:;[^:]*)?:(.+)/gi
    let appleEMatch
    while ((appleEMatch = appleEmailRegex.exec(block)) !== null) {
      const itemId = appleEMatch[1]
      const em = appleEMatch[2].trim()
      const labelRegex = new RegExp(`item${itemId}\\.X-ABLabel:(.+)`, 'i')
      const labelMatch = block.match(labelRegex)
      const label = labelMatch?.[1]?.trim() || ''
      if (!emails.find(e => e.email === em)) {
        emails.push({ email: em, label })
      }
    }

    // 分类 — CATEGORIES 字段
    const categories = []
    const catMatch = block.match(/CATEGORIES:(.+)/i)
    if (catMatch) {
      catMatch[1].split(',').forEach(c => {
        const name = c.trim()
        if (name) categories.push(name)
      })
    }

    // NOTE 字段
    const note = (block.match(/(?:^|\n)NOTE:(.+)/im)?.[1] || '').trim() || null

    // URL
    const url = (block.match(/(?:^|\n)URL(?:;[^:]*)?:(.+)/im)?.[1] || '').trim() || null

    // 解析层级分类路径
    const categoryPaths = parseCategoryPaths(note, catMatch?.[1])

    contacts.push({
      organization,
      url,
      photo,
      note,
      categories: [...new Set(categories)],
      categoryPaths,
      phones,
      emails
    })
  }

  return contacts
}

function base64ToBuffer(dataUri) {
  const base64 = dataUri.split(',')[1]
  return Buffer.from(base64, 'base64')
}

// 根据路径创建或查找分类树
async function findOrCreateCategoryPath(pathString) {
  const parts = pathString.split('»').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return null

  let parentId = null
  let categoryId = null

  for (const name of parts) {
    let cat = await prisma.category.findUnique({ where: { name } })

    if (!cat) {
      cat = await prisma.category.create({
        data: { name, parentId, sortOrder: 999 }
      })
    }

    parentId = cat.id
    categoryId = cat.id
  }

  return categoryId
}

export default async function vcfRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  // VCF 导入（上传文件并解析）
  fastify.post('/vcf/import', async (request, reply) => {
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: '未提供文件' })

    const buffer = await file.toBuffer()
    const content = buffer.toString('utf-8')
    const contacts = parseVcfContent(content)

    // 收集导入中涉及的所有分类
    const allCategories = [...new Set(contacts.flatMap(c => c.categories))]
    const existingCats = await prisma.category.findMany({
      where: { name: { in: allCategories } }
    })
    const existingNames = existingCats.map(c => c.name)
    const unknownCategories = allCategories.filter(c => !existingNames.includes(c))

    return {
      count: contacts.length,
      contacts,
      unknownCategories,
      existingCategories: existingCats
    }
  })

  // 批量导入到数据库
  fastify.post('/vcf/import/save', async (request, reply) => {
    const { contacts: importedContacts, newCategories = [] } = request.body || {}
    if (!importedContacts || !importedContacts.length) {
      return reply.code(400).send({ error: '没有可导入的联系人' })
    }

    // 自动创建新的分类（来自弹窗确认的）
    const createdCats = {}
    for (const catName of newCategories) {
      const existing = await prisma.category.findUnique({ where: { name: catName } })
      if (!existing) {
        const cat = await prisma.category.create({
          data: { name: catName, sortOrder: 999 }
        })
        createdCats[catName] = cat.id
      }
    }

    // 处理层级路径：为 categoryPaths 中的路径创建分类树
    for (const c of importedContacts) {
      if (c.categoryPaths?.length) {
        for (const pathStr of c.categoryPaths) {
          const leafId = await findOrCreateCategoryPath(pathStr)
          if (leafId) {
            c._resolvedCategoryId = c._resolvedCategoryId || leafId
            c._resolvedCategoryIds = c._resolvedCategoryIds || []
            if (!c._resolvedCategoryIds.includes(leafId)) {
              c._resolvedCategoryIds.push(leafId)
            }
          }
        }
      }
    }

    // 为那些前端指定了 _categoryName 但不在 newCategories 中的分类也自动创建
    for (const c of importedContacts) {
      if (c._categoryName && !createdCats[c._categoryName]) {
        const existing = await prisma.category.findUnique({ where: { name: c._categoryName } })
        if (!existing) {
          const cat = await prisma.category.create({
            data: { name: c._categoryName, sortOrder: 999 }
          })
          createdCats[c._categoryName] = cat.id
        }
      }
    }

    // 获取所有分类的 name -> id 映射
    const allCats = await prisma.category.findMany()
    const catNameToId = {}
    for (const cat of allCats) {
      catNameToId[cat.name] = cat.id
    }

    const results = []
    for (const c of importedContacts) {
      // 上传图片到七牛云
      let imagePath = null
      if (c.photo?.data) {
        try {
          const imgBuffer = base64ToBuffer(c.photo.data)
          const ext = c.photo.mimeType === 'jpeg' ? 'jpg' : 'png'
          const result = await uploadImage(imgBuffer, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`)
          imagePath = result.url
        } catch (err) {
          fastify.log.warn(`图片上传失败: ${c.organization} - ${err.message}`)
        }
      }

      // 确定分类关联 ID 列表
      const categoryIds = []

      // 优先使用层级路径解析的分类
      if (c._resolvedCategoryIds?.length) {
        categoryIds.push(...c._resolvedCategoryIds)
      }

      // 前端传入的分类
      if (c._categoryId) {
        const id = Number(c._categoryId)
        if (!categoryIds.includes(id)) categoryIds.push(id)
      }
      if (c._categoryName) {
        const id = catNameToId[c._categoryName] || createdCats[c._categoryName]
        if (id && !categoryIds.includes(id)) categoryIds.push(id)
      }

      // 从 CATEGORIES 字段匹配
      if (!categoryIds.length && c.categories?.length) {
        for (const catName of c.categories) {
          const id = catNameToId[catName] || createdCats[catName]
          if (id && !categoryIds.includes(id)) categoryIds.push(id)
        }
      }

      const contact = await prisma.contact.create({
        data: {
          organization: c.organization,
          url: c.url || null,
          imagePath,
          categories: categoryIds.length > 0 ? {
            create: categoryIds.map(cid => ({ categoryId: cid }))
          } : undefined,
          phones: c.phones?.length ? {
            create: c.phones.filter(p => p.number).map((p, i) => ({
              number: String(p.number),
              label: p.label || null,
              sortOrder: i
            }))
          } : undefined,
          emails: c.emails?.length ? {
            create: c.emails.filter(e => e.email).map((e, i) => ({
              email: e.email,
              label: e.label || null,
              sortOrder: i
            }))
          } : undefined,
          status: 'draft'
        }
      })
      results.push({
        id: contact.id,
        organization: contact.organization,
        imagePath: contact.imagePath,
        categoryIds
      })
    }

    return reply.code(201).send({
      count: results.length,
      newCategoriesCreated: Object.keys(createdCats)
    })
  })

  // 发布（生成 VCF 文件）
  fastify.post('/vcf/publish', async (request, reply) => {
    const publishedContacts = await prisma.contact.findMany({
      where: { status: 'published' },
      include: {
        categories: { include: { category: true } },
        phones: { orderBy: { sortOrder: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } }
      }
    })

    if (!publishedContacts.length) {
      return reply.code(400).send({ error: '没有已发布的联系人' })
    }

    const results = await generateAllVcfFiles(publishedContacts)
    const successes = results.filter(r => r.success)
    const failures = results.filter(r => !r.success)

    return {
      total: results.length,
      success: successes.length,
      failures: failures.length,
      details: successes.slice(0, 5).map(r => r.organization),
      errors: failures.map(r => r.error)
    }
  })

  // 下载单个联系人 VCF
  fastify.get('/vcf/download/:id', async (request, reply) => {
    const contact = await prisma.contact.findUnique({
      where: { id: Number(request.params.id) },
      include: {
        categories: { include: { category: true } },
        phones: { orderBy: { sortOrder: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } }
      }
    })

    if (!contact) return reply.code(404).send({ error: '联系人不存在' })

    contact._categoryPaths = await getCategoryPaths(contact)
    const vcfString = generateVcfFromContact(contact)
    const sanitizedName = contact.organization.replace(/[<>:"/\\|?*]/g, '_')

    reply.header('Content-Type', 'text/vcard; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(sanitizedName)}.vcf`)
    return vcfString
  })

  fastify.get('/vcf/download', async (request, reply) => {
    const publishedContacts = await prisma.contact.findMany({
      where: { status: 'published' },
      include: {
        categories: { include: { category: true } },
        phones: { orderBy: { sortOrder: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } }
      }
    })

    if (!publishedContacts.length) {
      return reply.code(400).send({ error: '没有已发布的联系人' })
    }

    // 预计算分类路径
    for (const c of publishedContacts) {
      c._categoryPaths = await getCategoryPaths(c)
    }

    const allVcf = publishedContacts
      .map(c => generateVcfFromContact(c))
      .join('\n')

    reply.header('Content-Type', 'text/vcard; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="vcards_all.vcf"')
    return allVcf
  })
}
