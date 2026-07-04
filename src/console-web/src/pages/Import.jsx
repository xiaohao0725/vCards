import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Import() {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.getCategories().then(setCategories)
  }, [])

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setParsed(null)
    setError('')
  }

  const handleParse = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const result = await api.importVcf(file)
      setParsed(result)
      if (result.count === 0) {
        setError('未解析到任何联系人')
      }
    } catch (err) {
      setError(`解析失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!parsed || !parsed.contacts.length) return
    setSaving(true)
    setError('')
    try {
      const result = await api.saveImport(parsed.contacts, categoryId)
      alert(`成功导入 ${result.count} 个联系人`)
      navigate('/')
    } catch (err) {
      setError(`导入失败: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="import-page">
      <h2>导入 VCF 文件</h2>

      <div className="import-drop">
        <input type="file" accept=".vcf,text/vcard" onChange={handleFileChange} />
        <button onClick={handleParse} disabled={!file || loading} className="btn-primary">
          {loading ? '解析中...' : '解析文件'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {parsed && parsed.count > 0 && (
        <div className="import-preview">
          <h3>解析结果：共 {parsed.count} 个联系人</h3>

          <div className="form-group">
            <label>统一分类</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">不指定</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <table className="contact-table">
            <thead>
              <tr>
                <th>组织名称</th>
                <th>电话</th>
                <th>邮箱</th>
                <th>网址</th>
              </tr>
            </thead>
            <tbody>
              {parsed.contacts.map((c, i) => (
                <tr key={i}>
                  <td>{c.organization}</td>
                  <td>{c.phoneNumbers?.slice(0, 2).join(', ') || '-'}</td>
                  <td>{c.emailAddresses?.slice(0, 2).join(', ') || '-'}</td>
                  <td>{c.url ? <a href={c.url} target="_blank" rel="noopener">链接</a> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="form-actions">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? '导入中...' : `导入 ${parsed.count} 个联系人`}
            </button>
            <button onClick={() => navigate('/')} className="btn-secondary">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
