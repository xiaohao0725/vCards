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
  const [showUnknownDialog, setShowUnknownDialog] = useState(false)
  const [unknownChecks, setUnknownChecks] = useState({})
  const [importResult, setImportResult] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { api.getCategories().then(setCategories) }, [])

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setParsed(null)
    setImportResult(null)
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
      } else if (result.unknownCategories?.length) {
        setUnknownChecks(
          Object.fromEntries(result.unknownCategories.map(c => [c, true]))
        )
        setShowUnknownDialog(true)
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
      const newCats = Object.entries(unknownChecks)
        .filter(([, checked]) => checked)
        .map(([name]) => name)
      const result = await api.saveImport(parsed.contacts, categoryId, newCats)
      setImportResult(result)
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

      {/* 未知分类弹窗 */}
      {showUnknownDialog && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>检测到 {Object.keys(unknownChecks).length} 个新分类</h3>
            <p>以下分类在数据库中不存在，是否自动创建？</p>
            {Object.keys(unknownChecks).map((name) => (
              <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <input
                  type="checkbox"
                  checked={unknownChecks[name]}
                  onChange={(e) => setUnknownChecks({ ...unknownChecks, [name]: e.target.checked })}
                />
                {name}
              </label>
            ))}
            <p style={{ color: '#888', fontSize: 13 }}>
              未勾选的分类，对应联系人将不设分类
            </p>
            <div className="form-actions">
              <button onClick={() => setShowUnknownDialog(false)} className="btn-primary">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入结果 */}
      {importResult && (
        <div className="import-preview">
          <h3>导入完成</h3>
          <p>成功导入 <strong>{importResult.count}</strong> 个联系人</p>
          {importResult.newCategoriesCreated?.length > 0 && (
            <p>新建分类: {importResult.newCategoriesCreated.join(', ')}</p>
          )}
          <div className="form-actions">
            <button onClick={() => navigate('/')} className="btn-primary">返回列表</button>
            <button onClick={() => { setImportResult(null); setParsed(null); setFile(null) }} className="btn-secondary">
              继续导入
            </button>
          </div>
        </div>
      )}

      {/* 预览表格 */}
      {parsed && parsed.count > 0 && !importResult && (
        <div className="import-preview">
          <h3>解析结果：共 {parsed.count} 个联系人</h3>

          <div className="form-group">
            <label>统一分类（将覆盖文件中的分类）</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">不覆盖</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            <table className="contact-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>图片</th>
                  <th>组织名称</th>
                  <th>电话</th>
                  <th>邮箱</th>
                  <th>分类</th>
                </tr>
              </thead>
              <tbody>
                {parsed.contacts.map((c, i) => (
                  <tr key={i}>
                    <td>
                      {c.photo?.data ? (
                        <img src={c.photo.data} alt="" className="contact-thumb" style={{ width: 36, height: 36 }} />
                      ) : c.photo?.url ? (
                        <img src={c.photo.url} alt="" className="contact-thumb" style={{ width: 36, height: 36 }} />
                      ) : (
                        <span style={{ color: '#ccc', fontSize: 12 }}>-</span>
                      )}
                    </td>
                    <td>{c.organization}</td>
                    <td>
                      {c.phones?.length
                        ? c.phones.slice(0, 3).map((p, j) => (
                            <div key={j} style={{ fontSize: 12 }}>
                              {p.number}
                              {p.label && <span style={{ color: '#888', marginLeft: 4 }}>({p.label})</span>}
                            </div>
                          ))
                        : '-'}
                      {c.phones?.length > 3 && <span style={{ color: '#888', fontSize: 12 }}>+{c.phones.length - 3} ...</span>}
                    </td>
                    <td>
                      {c.emails?.length
                        ? c.emails.slice(0, 2).map((e, j) => (
                            <div key={j} style={{ fontSize: 12 }}>
                              {e.email}
                              {e.label && <span style={{ color: '#888', marginLeft: 4 }}>({e.label})</span>}
                            </div>
                          ))
                        : '-'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {c.categories?.length ? c.categories.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? '导入中（含图片上传）...' : `导入 ${parsed.count} 个联系人`}
            </button>
            <button onClick={() => navigate('/')} className="btn-secondary">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
