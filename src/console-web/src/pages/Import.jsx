import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Import() {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showUnknownDialog, setShowUnknownDialog] = useState(false)
  const [unknownChecks, setUnknownChecks] = useState({})
  const [importResult, setImportResult] = useState(null)
  // 每个联系人的分类选择: { [index]: categoryId | "new:XXX" | "" (不设分类) }
  const [contactSelections, setContactSelections] = useState({})
  const [selectedContacts, setSelectedContacts] = useState(new Set())
  const [batchCategory, setBatchCategory] = useState('')
  const navigate = useNavigate()

  useEffect(() => { api.getCategories().then(setCategories) }, [])

  const resolveCategoryId = (parsedCats, existingCats) => {
    if (!parsedCats?.length) return ''
    for (const name of parsedCats) {
      const found = existingCats.find(c => c.name === name)
      if (found) return String(found.id)
    }
    // 全部是未知分类
    return `new:${parsedCats[0]}`
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setParsed(null)
    setImportResult(null)
    setError('')
    setContactSelections({})
  }

  const handleParse = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const result = await api.importVcf(file)
      setParsed(result)

      // 为每个联系人计算初始分类选择
      const selections = {}
      result.contacts.forEach((c, i) => {
        selections[i] = resolveCategoryId(c.categories, result.existingCategories || [])
      })
      setContactSelections(selections)

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

  const handleUnknownConfirm = () => {
    setShowUnknownDialog(false)
    // 对于未勾选的未知分类，将对应联系人的选择改为空
    const updated = { ...contactSelections }
    const uncheckedCats = Object.entries(unknownChecks)
      .filter(([, checked]) => !checked)
      .map(([name]) => name)
    if (uncheckedCats.length > 0) {
      Object.entries(updated).forEach(([i, val]) => {
        if (typeof val === 'string' && val.startsWith('new:')) {
          const catName = val.slice(4)
          if (uncheckedCats.includes(catName)) {
            updated[i] = ''
          }
        }
      })
    }
    setContactSelections(updated)
  }

  const handleContactCategoryChange = (index, value) => {
    setContactSelections(prev => ({ ...prev, [index]: value }))
  }

  const toggleSelect = (index) => {
    setSelectedContacts(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!parsed) return
    if (selectedContacts.size === parsed.contacts.length) {
      setSelectedContacts(new Set())
    } else {
      setSelectedContacts(new Set(parsed.contacts.map((_, i) => i)))
    }
  }

  const handleBatchCategory = () => {
    if (!batchCategory || !parsed) return
    const count = selectedContacts.size
    setContactSelections(prev => {
      const updated = { ...prev }
      selectedContacts.forEach(i => { updated[i] = batchCategory })
      return updated
    })
    setSelectedContacts(new Set())
    setBatchCategory('')
  }

  const handleSave = async () => {
    if (!parsed || !parsed.contacts.length) return
    setSaving(true)
    setError('')
    try {
      const newCats = Object.entries(unknownChecks)
        .filter(([, checked]) => checked)
        .map(([name]) => name)

      // 为每个联系人附加独立分类信息
      const contactsWithCategory = parsed.contacts.map((c, i) => {
        const sel = contactSelections[i] || ''
        const catId = sel.startsWith('new:') ? null : (sel ? Number(sel) : null)
        const catName = sel.startsWith('new:') ? sel.slice(4) : null
        return { ...c, _categoryId: catId, _categoryName: catName }
      })

      const result = await api.saveImport(contactsWithCategory, newCats)
      setImportResult({
        count: result.count,
        contacts: result.contacts,
        newCategoriesCreated: result.newCategoriesCreated || []
      })
    } catch (err) {
      setError(`导入失败: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const getCategoryLabel = (val, cats) => {
    if (!val) return '不设分类'
    if (val.startsWith('new:')) {
      const name = val.slice(4)
      const checked = unknownChecks[name] !== false
      return checked ? `新建:${name}` : '不设分类（未创建）'
    }
    const cat = cats.find(c => String(c.id) === val)
    return cat?.name || '未知'
  }

  const getCategoryStyle = (val) => {
    if (!val) return {}
    if (val.startsWith('new:')) {
      const name = val.slice(4)
      return unknownChecks[name] !== false
        ? { color: '#388e3c', fontWeight: 600 }
        : { color: '#999' }
    }
    return {}
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
              <button onClick={handleUnknownConfirm} className="btn-primary">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入结果 */}
      {importResult && (
        <div className="import-preview">
          <h3>导入完成</h3>
          <p>成功导入 <strong>{importResult.count}</strong> / {importResult.total} 个联系人</p>
          {importResult.newCategoriesCreated?.length > 0 && (
            <p>新建分类: {importResult.newCategoriesCreated.join(', ')}</p>
          )}
          {importResult.errors?.length > 0 && (
            <div className="error-msg">
              <p>失败:</p>
              {importResult.errors.slice(0, 5).map((e, i) => (
                <div key={i}>{e.organization}: {e.error}</div>
              ))}
            </div>
          )}
          <div className="form-actions">
            <button onClick={() => navigate('/')} className="btn-primary">返回列表</button>
            <button onClick={() => { setImportResult(null); setParsed(null); setFile(null); setContactSelections({}) }} className="btn-secondary">
              继续导入
            </button>
          </div>
        </div>
      )}

      {/* 预览表格 */}
      {parsed && parsed.count > 0 && !importResult && (
        <div className="import-preview">
          <h3>解析结果：共 {parsed.count} 个联系人</h3>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
            每行的「分类」列已根据 VCF 数据自动选择，可手动修改
          </p>

          {/* 批量设置分类 */}
          {selectedContacts.size > 0 && (
            <div style={{ background: '#f0f4ff', padding: '10px 14px', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>已选 {selectedContacts.size} 个联系人</span>
              <select
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
              >
                <option value="">批量设置分类...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                ))}
                <option value="">不设分类</option>
              </select>
              <button onClick={handleBatchCategory} disabled={!batchCategory} className="btn-sm" style={{ background: '#667eea', color: 'white', border: 'none' }}>
                应用
              </button>
              <button onClick={() => setSelectedContacts(new Set())} className="btn-sm">取消选择</button>
            </div>
          )}

          <div style={{ maxHeight: 500, overflow: 'auto' }}>
            <table className="contact-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox"
                      checked={parsed && selectedContacts.size === parsed.contacts.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ width: 40 }}>图片</th>
                  <th>组织名称</th>
                  <th>电话</th>
                  <th>邮箱</th>
                  <th style={{ width: 150 }}>分类</th>
                </tr>
              </thead>
              <tbody>
                {parsed.contacts.map((c, i) => (
                  <tr key={i} style={selectedContacts.has(i) ? { background: '#f0f4ff' } : {}}>
                    <td>
                      <input type="checkbox"
                        checked={selectedContacts.has(i)}
                        onChange={() => toggleSelect(i)}
                      />
                    </td>
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
                    <td>
                      <select
                        value={contactSelections[i] || ''}
                        onChange={(e) => handleContactCategoryChange(i, e.target.value)}
                        style={{ ...getCategoryStyle(contactSelections[i] || ''), width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                      >
                        <option value="">不设分类</option>
                        {categories.filter(cat => {
                          // 排除已选为 "new:" 的未知分类
                          return true
                        }).map((cat) => (
                          <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                        ))}
                        {/* 未知分类选项 */}
                        {c.categories?.map((catName) => {
                          const exists = categories.some(dc => dc.name === catName)
                          if (!exists) {
                            return (
                              <option key={`new-${catName}`} value={`new:${catName}`}>
                                新建: {catName}
                              </option>
                            )
                          }
                          return null
                        })}
                      </select>
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
            <button onClick={() => { setParsed(null); setFile(null) }} className="btn-secondary">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
