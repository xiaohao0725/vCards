import fs from 'node:fs'
import path from 'node:path'
import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { generateVcfFromContact, generateAllVcfFiles } from '../services/vcfGenerator.js'
import { uploadImage } from '../services/qiniu.js'

const VCF_OUTPUT_DIR = process.env.VCF_OUTPUT_DIR || '/app/vcards-data'

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
      // 提取编码和类型
      const encMatch = block.match(/PHOTO;ENCODING=([^;:]+)/i)
      const typeMatch = block.match(/PHOTO(?:;.*)?;TYPE=(\w+)/i) || block.match(/PHOTO;([^;:]+);TYPE=(\w+)/i)
      const mimeType = typeMatch?.[2] || typeMatch?.[1] || 'PNG'
      const encoding = encMatch?.[1]?.toUpperCase()

      if (val.startsWith('http')) {
        photo = { url: val, mimeType: mimeType.toLowerCase() }
      } else {
        // 可能是多行 base64（去除换行符和空格）
        const data = val.replace(/\s/g, '')
        if (data.length > 20) {
          photo = { data: `data:image/${mimeType.toLowerCase()};base64,${data}`, mimeType: mimeType.toLowerCase() }
        }
      }
    }

    // 电话 — 带标签解析
    const phones = []
    // TEL;TYPE=work,voice:123456
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

    // 分类
    const categories = []
    const catMatch = block.match(/CATEGORIES:(.+)/i)
    if (catMatch) {
      catMatch[1].split(',').forEach(c => {
        const name = c.trim()
        if (name) categories.push(name)
      })
    }
    const xCatMatch = block.match(/X-CATEGORY:(.+)/i)
    if (xCatMatch) {
      const name = xCatMatch[1].trim()
      if (name && !categories.includes(name)) categories.push(name)
    }

    // URL
    const url = (block.match(/(?:^|\n)URL(?:;[^:]*)?:(.+)/im)?.[1] || '').trim() || null

    contacts.push({
      organization,
      url,
      photo,
      categories: [...new Set(categories)],
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
    const { contacts: importedContacts, categoryId, newCategories = [] } = request.body || {}
    if (!importedContacts || !importedContacts.length) {
      return reply.code(400).send({ error: '没有可导入的联系人' })
    }

    // 自动创建新的分类
    const createdCats = {}
    for (const catName of newCategories) {
      const cat = await prisma.category.create({
        data: { name: catName, sortOrder: 999 }
      })
      createdCats[catName] = cat.id
    }

    // 获取所有分类的 name -> id 映射
    const allCats = await prisma.category.findMany()
    const catNameToId = {}
    for (const c of allCats) {
      catNameToId[c.name] = c.id
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

      // 确定分类
      let resolvedCategoryId = categoryId ? Number(categoryId) : null
      if (!resolvedCategoryId && c.categories?.length) {
        for (const catName of c.categories) {
          const id = catNameToId[catName] || createdCats[catName]
          if (id) { resolvedCategoryId = id; break }
        }
      }

      const contact = await prisma.contact.create({
        data: {
          organization: c.organization,
          categoryId: resolvedCategoryId,
          url: c.url || null,
          imagePath,
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
        categoryId: contact.categoryId
      })
    }

    return reply.code(201).send({
      count: results.length,
      contacts: results,
      newCategoriesCreated: Object.keys(createdCats)
    })
  })

  // 发布（生成 VCF 文件）
  fastify.post('/vcf/publish', async (request, reply) => {
    const publishedContacts = await prisma.contact.findMany({
      where: { status: 'published' },
      include: {
        phones: { orderBy: { sortOrder: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } }
      }
    })

    if (!publishedContacts.length) {
      return reply.code(400).send({ error: '没有已发布的联系人' })
    }

    const results = generateAllVcfFiles(publishedContacts)
    const successes = results.filter(r => r.success)
    const failures = results.filter(r => !r.success)

    if (successes.length > 0) {
      const allVcf = successes
        .map(r => fs.readFileSync(r.path, 'utf-8'))
        .join('\n')
      const summaryPath = path.join(VCF_OUTPUT_DIR, '汇总.vcf')
      fs.writeFileSync(summaryPath, allVcf, 'utf-8')
    }

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
        phones: { orderBy: { sortOrder: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } }
      }
    })

    if (!contact) return reply.code(404).send({ error: '联系人不存在' })

    const vcfString = generateVcfFromContact(contact)
    const sanitizedName = contact.organization.replace(/[<>:"/\\|?*]/g, '_')

    reply.header('Content-Type', 'text/vcard; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${sanitizedName}.vcf"`)
    return vcfString
  })

  fastify.get('/vcf/download', async (request, reply) => {
    const publishedContacts = await prisma.contact.findMany({
      where: { status: 'published' },
      include: {
        phones: { orderBy: { sortOrder: 'asc' } },
        emails: { orderBy: { sortOrder: 'asc' } }
      }
    })

    if (!publishedContacts.length) {
      return reply.code(400).send({ error: '没有已发布的联系人' })
    }

    const allVcf = publishedContacts
      .map(c => generateVcfFromContact(c))
      .join('\n')

    reply.header('Content-Type', 'text/vcard; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="vcards_all.vcf"')
    return allVcf
  })
}
