import qiniu from 'qiniu'

const accessKey = process.env.QINIU_ACCESS_KEY || ''
const secretKey = process.env.QINIU_SECRET_KEY || ''
const imageBucket = process.env.QINIU_IMAGE_BUCKET || 'fbk-image'
const fileBucket = process.env.QINIU_FILE_BUCKET || 'fbk-files'
const region = process.env.QINIU_REGION || 'z2'
const imageDomain = process.env.QINIU_IMAGE_DOMAIN || 'images.fbk.codexs.cn'
const fileDomain = process.env.QINIU_FILE_DOMAIN || 'file.fbk.codexs.cn'

const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)

function getUploadToken(bucket) {
  const putPolicy = new qiniu.rs.PutPolicy({ scope: bucket })
  return putPolicy.uploadToken(mac)
}

function getBucketManager() {
  const config = new qiniu.conf.Config()
  config.zone = qiniu.zone[`Zone_${region}`]
  return new qiniu.rs.BucketManager(mac, config)
}

export function uploadImage(fileBuffer, fileName) {
  return new Promise((resolve, reject) => {
    const uploadToken = getUploadToken(imageBucket)
    const key = `vcards/${fileName}`
    const formUploader = new qiniu.form_up.FormUploader()
    const putExtra = new qiniu.form_up.PutExtra()

    formUploader.put(uploadToken, key, fileBuffer, putExtra, (err, body, info) => {
      if (err) return reject(err)
      if (info.statusCode === 200) {
        resolve({ key, url: `https://${imageDomain}/${key}` })
      } else {
        reject(new Error(`上传失败: ${info.statusCode}`))
      }
    })
  })
}

export function uploadVcfFile(fileBuffer, fileName) {
  return new Promise((resolve, reject) => {
    const uploadToken = getUploadToken(fileBucket)
    const key = `vcards/${fileName}`
    const formUploader = new qiniu.form_up.FormUploader()
    const putExtra = new qiniu.form_up.PutExtra()

    formUploader.put(uploadToken, key, fileBuffer, putExtra, (err, body, info) => {
      if (err) return reject(err)
      if (info.statusCode === 200) {
        resolve({ key, url: `https://${fileDomain}/${key}` })
      } else {
        reject(new Error(`上传失败: ${info.statusCode}`))
      }
    })
  })
}

export function getImageUrl(key) {
  if (!key) return null
  if (key.startsWith('http')) return key
  return `https://${imageDomain}/${key}`
}

export function getFileUrl(key) {
  if (!key) return null
  if (key.startsWith('http')) return key
  return `https://${fileDomain}/${key}`
}
