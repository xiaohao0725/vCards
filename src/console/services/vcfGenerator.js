import fs from 'node:fs'
import path from 'node:path'
import vCardsJS from 'vcards-js'
import prisma from './prisma.js'
import addPhoneticField from '../../utils/pinyin.js'

const VCF_OUTPUT_DIR = process.env.VCF_OUTPUT_DIR || '/app/vcards-data'

export { VCF_OUTPUT_DIR }

function writeVcfFile(fileName, vcfString) {
  const outputPath = path.join(VCF_OUTPUT_DIR, `${fileName}.vcf`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, vcfString, 'utf-8')
  return outputPath
}

export async function getCategoryPaths(contact) {
  const categoryLinks = contact.categories || []
  if (!categoryLinks.length) return []

  const categoryIds = categoryLinks.map(cc => cc.categoryId || cc.category?.id).filter(Boolean)
  if (!categoryIds.length) return []

  const allCategories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true, parentId: true }
  })

  // 构建 parent 映射
  const catMap = {}
  const rootIds = new Set()
  for (const cat of allCategories) {
    catMap[cat.id] = { id: cat.id, name: cat.name, parentId: cat.parentId }
  }

  // 递归收集所有涉及的祖先 ID
  let needsMore = true
  while (needsMore) {
    needsMore = false
    for (const cat of Object.values(catMap)) {
      if (cat.parentId && !catMap[cat.parentId]) {
        needsMore = true
        rootIds.add(cat.parentId)
      }
    }
    if (needsMore && rootIds.size > 0) {
      const parents = await prisma.category.findMany({
        where: { id: { in: [...rootIds] } },
        select: { id: true, name: true, parentId: true }
      })
      for (const p of parents) {
        catMap[p.id] = { id: p.id, name: p.name, parentId: p.parentId }
        if (p.parentId && !catMap[p.parentId]) {
          rootIds.add(p.parentId)
        }
      }
      rootIds.clear()
    }
  }

  const paths = []
  for (const catId of categoryIds) {
    const parts = []
    let current = catMap[catId]
    while (current) {
      parts.unshift(current.name)
      current = current.parentId ? catMap[current.parentId] : null
    }
    paths.push(parts.join('»'))
  }

  return paths
}

export function generateVcfFromContact(contact) {
  const vCard = vCardsJS()

  vCard.isOrganization = true
  vCard.organization = contact.organization

  if (contact.phones && contact.phones.length > 0) {
    if (!Array.isArray(vCard.cellPhone)) vCard.cellPhone = []
    contact.phones
      .filter(p => p.number && !p.label)
      .forEach(p => {
        vCard.cellPhone.push(String(p.number))
      })
  }

  if (contact.emails && contact.emails.length > 0) {
    if (!Array.isArray(vCard.workEmail)) vCard.workEmail = []
    contact.emails
      .filter(e => e.email && !e.label)
      .forEach(e => {
        vCard.workEmail.push(String(e.email))
      })
  }

  if (contact.url) {
    vCard.url = contact.url
  }

  vCard.uid = contact.id ? `vcards-cn-${contact.id}` : `vcards-cn-${Date.now()}`

  let formatted = vCard.getFormattedString()

  // 添加分类路径（多对多，逗号分隔）
  if (contact._categoryPaths?.length) {
    const catsStr = contact._categoryPaths.join(',')
    const lines = formatted.split('\n')
    const orgIdx = lines.findIndex(l => l.startsWith('ORG'))
    if (orgIdx !== -1) {
      lines.splice(orgIdx + 1, 0, `CATEGORIES:${catsStr}`)
      // 写入 NOTE 备注
      const noteLabel = contact._categoryPaths.length > 1 ? '覆盖地区' : '分类路径'
      lines.splice(orgIdx + 2, 0, `NOTE:${noteLabel}: ${catsStr}`)
      formatted = lines.join('\n')
    }
  }

  // 添加拼音字段
  formatted = addPhoneticField(formatted, 'ORG')

  // 添加带标签的电话和邮箱
  if (contact.phones) {
    const labeledPhones = contact.phones.filter(p => p.label && p.number)
    if (labeledPhones.length > 0) {
      const lines = formatted.split('\n')
      const vcardEndIndex = lines.findIndex(l => l.includes('END:VCARD'))
      const insertLines = labeledPhones.flatMap(p => [
        `item${p.id}.TEL;type=pref:${p.number}`,
        `item${p.id}.X-ABLabel:${p.label}`
      ])
      lines.splice(vcardEndIndex, 0, ...insertLines)
      formatted = lines.join('\n')
    }
  }

  // 添加带标签的邮箱
  if (contact.emails) {
    const labeledEmails = contact.emails.filter(e => e.label && e.email)
    if (labeledEmails.length > 0) {
      const lines = formatted.split('\n')
      const vcardEndIndex = lines.findIndex(l => l.includes('END:VCARD'))
      // 找到已使用的最大 item ID
      let maxItemId = 0
      for (const line of lines) {
        const itemMatch = line.match(/^item(\d+)\./)
        if (itemMatch) {
          maxItemId = Math.max(maxItemId, Number(itemMatch[1]))
        }
      }
      const insertLines = labeledEmails.flatMap((e, i) => {
        const itemId = maxItemId + i + 1
        return [
          `item${itemId}.EMAIL;type=pref:${e.email}`,
          `item${itemId}.X-ABLabel:${e.label}`
        ]
      })
      lines.splice(vcardEndIndex, 0, ...insertLines)
      formatted = lines.join('\n')
    }
  }

  return formatted
}

export async function generateAllVcfFiles(contacts, silent = false) {
  // 清空旧 vcf 文件
  if (fs.existsSync(VCF_OUTPUT_DIR)) {
    const oldFiles = fs.readdirSync(VCF_OUTPUT_DIR)
    for (const file of oldFiles) {
      if (file.endsWith('.vcf') || file === '.Radicale.props') {
        fs.unlinkSync(path.join(VCF_OUTPUT_DIR, file))
      }
    }
  } else {
    fs.mkdirSync(VCF_OUTPUT_DIR, { recursive: true })
  }

  // 预计算所有联系人的分类路径
  for (const contact of contacts) {
    contact._categoryPaths = await getCategoryPaths(contact)
  }

  const results = []
  const allVcfLines = []

  for (const contact of contacts) {
    try {
      const vcfString = generateVcfFromContact(contact)
      const sanitizedName = contact.organization.replace(/[<>:"/\\|?*]/g, '_')
      const fileName = `${sanitizedName}.vcf`
      const filePath = path.join(VCF_OUTPUT_DIR, fileName)
      fs.writeFileSync(filePath, vcfString, 'utf-8')
      allVcfLines.push(vcfString)
      if (!silent) {
        results.push({ organization: contact.organization, path: filePath, success: true })
      }
    } catch (err) {
      if (!silent) {
        results.push({ organization: contact.organization, success: false, error: err.message })
      }
    }
  }

  // 写入汇总文件（供下载用，放在 VCF_OUTPUT_DIR 父目录避免被 Radicale 解析）
  const summaryDir = path.dirname(VCF_OUTPUT_DIR)
  if (!fs.existsSync(summaryDir)) fs.mkdirSync(summaryDir, { recursive: true })
  if (allVcfLines.length > 0) {
    fs.writeFileSync(path.join(summaryDir, '汇总.vcf'), allVcfLines.join('\n'), 'utf-8')
  }

  // 写入 Radicale 元数据
  const propContent = JSON.stringify({
    'D:displayname': `全部(${contacts.length})`,
    tag: 'VADDRESSBOOK'
  })
  fs.writeFileSync(path.join(VCF_OUTPUT_DIR, '.Radicale.props'), propContent, 'utf-8')

  return results
}
