import fs from 'node:fs'
import path from 'node:path'
import vCardsJS from 'vcards-js'
import { addPhoneticField } from '../../utils/pinyin.js'

const VCF_OUTPUT_DIR = process.env.VCF_OUTPUT_DIR || '/app/vcards-data'

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

  let formatted = vCard.getFormattedString()

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

export function generateAllVcfFiles(contacts) {
  const results = []
  for (const contact of contacts) {
    try {
      const vcfString = generateVcfFromContact(contact)
      const sanitizedName = contact.organization.replace(/[<>:"/\\|?*]/g, '_')
      const filePath = writeVcfFile(sanitizedName, vcfString)
      results.push({ organization: contact.organization, path: filePath, success: true })
    } catch (err) {
      results.push({ organization: contact.organization, success: false, error: err.message })
    }
  }
  return results
}
