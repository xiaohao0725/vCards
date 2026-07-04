import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

const emptyPhone = { number: '', label: '' }
const emptyEmail = { email: '', label: '' }

export default function Editor() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [organization, setOrganization] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [url, setUrl] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [phones, setPhones] = useState([{ ...emptyPhone }])
  const [emails, setEmails] = useState([{ ...emptyEmail }])
  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getCategories().then(setCategories)
  }, [])

  useEffect(() => {
    if (!id) return
    api.getContact(id).then((c) => {
      setOrganization(c.organization)
      setCategoryId(c.categoryId || '')
      setUrl(c.url || '')
      setImagePath(c.imagePath || '')
      setPhones(c.phones.length ? c.phones : [{ ...emptyPhone }])
      setEmails(c.emails.length ? c.emails : [{ ...emptyEmail }])
    }).catch((err) => setError(err.message))
  }, [id])

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await api.uploadImage(file)
      setImagePath(result.url)
    } catch (err) {
      alert(`上传失败: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const addPhone = () => setPhones([...phones, { ...emptyPhone }])
  const updatePhone = (i, field, value) => {
    const updated = [...phones]
    updated[i] = { ...updated[i], [field]: value }
    setPhones(updated)
  }
  const removePhone = (i) => setPhones(phones.filter((_, idx) => idx !== i))

  const addEmail = () => setEmails([...emails, { ...emptyEmail }])
  const updateEmail = (i, field, value) => {
    const updated = [...emails]
    updated[i] = { ...updated[i], [field]: value }
    setEmails(updated)
  }
  const removeEmail = (i) => setEmails(emails.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!organization.trim()) {
      setError('组织名称不能为空')
      return
    }

    const validPhones = phones.filter(p => p.number.trim())
    const validEmails = emails.filter(e => e.email.trim())
    if (!validPhones.length && !validEmails.length) {
      setError('至少需要一个电话或邮箱')
      return
    }

    setSaving(true)
    setError('')

    const data = {
      organization: organization.trim(),
      categoryId: categoryId || null,
      url: url.trim() || null,
      imagePath: imagePath || null,
      phones: validPhones,
      emails: validEmails
    }

    try {
      if (isEdit) {
        await api.updateContact(id, data)
      } else {
        await api.createContact(data)
      }
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor">
      <h2>{isEdit ? '编辑联系人' : '新建联系人'}</h2>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>组织名称 *</label>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>分类</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">请选择</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>网址</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
        </div>

        <div className="form-group">
          <label>图标</label>
          <div className="image-upload">
            {imagePath && <img src={imagePath} alt="" className="image-preview" />}
            <input type="file" accept="image/*" onChange={handleImageUpload} />
            {uploading && <span>上传中...</span>}
            <input
              type="text"
              value={imagePath}
              onChange={(e) => setImagePath(e.target.value)}
              placeholder="或手动输入图片 URL"
            />
          </div>
        </div>

        <div className="form-section">
          <div className="section-header">
            <label>电话</label>
            <button type="button" onClick={addPhone} className="btn-sm">+ 添加</button>
          </div>
          {phones.map((p, i) => (
            <div key={i} className="array-row">
              <input
                type="text"
                value={p.number}
                onChange={(e) => updatePhone(i, 'number', e.target.value)}
                placeholder="号码"
              />
              <input
                type="text"
                value={p.label}
                onChange={(e) => updatePhone(i, 'label', e.target.value)}
                placeholder="标签（可选）"
              />
              {phones.length > 1 && (
                <button type="button" onClick={() => removePhone(i)} className="btn-sm btn-danger">×</button>
              )}
            </div>
          ))}
        </div>

        <div className="form-section">
          <div className="section-header">
            <label>邮箱</label>
            <button type="button" onClick={addEmail} className="btn-sm">+ 添加</button>
          </div>
          {emails.map((e, i) => (
            <div key={i} className="array-row">
              <input
                type="email"
                value={e.email}
                onChange={(e) => updateEmail(i, 'email', e.target.value)}
                placeholder="邮箱地址"
              />
              <input
                type="text"
                value={e.label}
                onChange={(e) => updateEmail(i, 'label', e.target.value)}
                placeholder="标签（可选）"
              />
              {emails.length > 1 && (
                <button type="button" onClick={() => removeEmail(i)} className="btn-sm btn-danger">×</button>
              )}
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? '保存中...' : '保存'}
          </button>
          <button type="button" onClick={() => navigate('/')} className="btn-secondary">取消</button>
        </div>
      </form>
    </div>
  )
}
