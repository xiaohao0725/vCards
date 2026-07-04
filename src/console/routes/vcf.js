import fs from 'node:fs'
import path from 'node:path'
import prisma from '../services/prisma.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { generateVcfFromContact, generateAllVcfFiles } from '../services/vcfGenerator.js'
import { uploadVcfFile } from '../services/qiniu.js'

const VCF_OUTPUT_DIR = process.env.VCF_OUTPUT_DIR || '/app/vcards-data'

function parseVcfContent(content) {
  const contacts = []
  const vcardBlocks = content.split(/END:VCARD\s*/i)

  for (const block of vcardBlocks) {
    if (!block.trim() || !block.includes('BEGIN:VCARD')) continue

    const getValue = (field) => {
      const regex = new RegExp(`${field}(?:;[^:]+)?:(.+)`, 'i')
      const match = block.match(regex)
      return match ? match[1].trim() : null
    }

    const getAllValues = (field) => {
      const regex = new RegExp(`${field}(?:;[^:]+)?:(.+)`, 'gi')
      const results = []
      let match
      while ((match = regex.exec(block)) !== null) {
        results.push(match[1].trim())
      }
      return results
    }

    const organization = getValue('ORG') || getValue('FN') || '未知组织'
    const phoneNumbers = getAllValues('TEL')
    const emailAddresses = getAllValues('EMAIL')
    const url = getValue('URL')

    contacts.push({ organization, phoneNumbers, emailAddresses, url })
  }

  return contacts
}

export default async function vcfRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware)

  // VCF 导入（上传文件并解析）
  fastify.post('/vcf/import', async (request, reply) => {
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: '未提供文件' })

    const buffer = await file.toBuffer()
    const content = buffer.toString('utf-8')
    const parsedContacts = parseVcfContent(content)

    return { count: parsedContacts.length, contacts: parsedContacts }
  })

  // 批量导入到数据库
  fastify.post('/vcf/import/save', async (request, reply) => {
    const { contacts: importedContacts, categoryId } = request.body || {}
    if (!importedContacts || !importedContacts.length) {
      return reply.code(400).send({ error: '没有可导入的联系人' })
    }

    const results = []
    for (const c of importedContacts) {
      const contact = await prisma.contact.create({
        data: {
          organization: c.organization,
          categoryId: categoryId ? Number(categoryId) : null,
          url: c.url || null,
          phones: c.phoneNumbers?.length ? {
            create: c.phoneNumbers.map((n, i) => ({ number: String(n), sortOrder: i }))
          } : undefined,
          emails: c.emailAddresses?.length ? {
            create: c.emailAddresses.map((e, i) => ({ email: e, sortOrder: i }))
          } : undefined,
          status: 'draft'
        }
      })
      results.push(contact)
    }

    return reply.code(201).send({ count: results.length, contacts: results })
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

    // 生成 VCF 文件
    const results = generateAllVcfFiles(publishedContacts)
    const successes = results.filter(r => r.success)
    const failures = results.filter(r => !r.success)

    // 生成汇总文件
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

  // 下载全部已发布 VCF（汇总文件）
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
