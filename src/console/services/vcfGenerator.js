import fs from 'node:fs'
import path from 'node:path'
import vCardsJS from 'vcards-js'
import addPhoneticField from '../../utils/pinyin.js'

const VCF_OUTPUT_DIR = process.env.VCF_OUTPUT_DIR || '/app/vcards-data'

export { VCF_OUTPUT_DIR }

function writeVcfFile(fileName, vcfString) {
  const outputPath = path.join(VCF_OUTPUT_DIR, `${fileName}.vcf`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, vcfString, 'utf-8')
  return outputPath
}

export function generateVcfFromContact(contact) {
  const vCard = vCardsJS()

  vCard.isOrganization = true
  vCard.organization = contact.organization

  if (contact.phones && contact.phones.length > 0) {
    if (!Array.isArray(vCard.cellPhone)) vCard.cellPhone = []
    contact.phones
      .filter(p => p.number)
      .forEach(p => {
        if (p.label) {
          vCard.cellPhone.push({ number: p.number, label: p.label })
        } else {
          vCard.cellPhone.push(p.number)
        }
      })
  }

  if (contact.emails && contact.emails.length > 0) {
    if (!Array.isArray(vCard.workEmail)) vCard.workEmail = []
    contact.emails
      .filter(e => e.email)
      .forEach(e => {
        if (e.label) {
          vCard.workEmail.push({ email: e.email, label: e.label })
        } else {
          vCard.workEmail.push(e.email)
        }
      })
  }

  if (contact.url) {
    vCard.url = contact.url
  }

  vCard.uid = contact.id ? `vcards-cn-${contact.id}` : `vcards-cn-${Date.now()}`

  let formatted = vCard.getFormattedString()

  // 添加分类信息
  if (contact.category?.name) {
    const lines = formatted.split('\n')
    const orgIndex = lines.findIndex(l => l.startsWith('ORG'))
    if (orgIndex !== -1) {
      lines.splice(orgIndex + 1, 0, `CATEGORIES:${contact.category.name}`)
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

  return formatted
}

export function generateAllVcfFiles(contacts, silent = false) {
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

  // 写入汇总文件
  if (allVcfLines.length > 0) {
    const summaryPath = path.join(VCF_OUTPUT_DIR, '汇总.vcf')
    fs.writeFileSync(summaryPath, allVcfLines.join('\n'), 'utf-8')
  }

  // 写入 Radicale 元数据
  const propContent = JSON.stringify({
    'D:displayname': `全部(${contacts.length})`,
    tag: 'VADDRESSBOOK'
  })
  fs.writeFileSync(path.join(VCF_OUTPUT_DIR, '.Radicale.props'), propContent, 'utf-8')

  return results
}
