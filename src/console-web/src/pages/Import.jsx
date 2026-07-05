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
  // 每个联系人的分类选择: { [index]: string[] } 支持多分类
  const [contactSelections, setContactSelections] = useState({})
  const [selectedContacts, setSelectedContacts] = useState(new Set())
  const [batchCategory, setBatchCategory] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { api.getCategories().then(setCategories) }, [])

  const resolveCategoryIds = (parsedCats, existingCats) => {
    if (!parsedCats?.length) return []
    const ids = []
    for (const name of parsedCats) {
      const found = existingCats.find(c => c.name === name)
      if (found) ids.push(String(found.id))
      else ids.push(`new:${name}`)
    }
    return ids
  }

  const resolveCategoryPaths = (parsedPaths, existingCats) => {
    if (!parsedPaths?.length) return []
    // categoryPaths 是完整路径如 "本地生活»广东»深圳"
    // 尝试通过路径最后一个名称匹配分类
    return parsedPaths.map(p => {
      const leaf = p.split('»').pop().trim()
      const found = existingCats.find(c => c.name === leaf)
      return found ? String(found.id) : `new:${leaf}`
    })
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
        // 优先用 categoryPaths 匹配
        const pathIds = resolveCategoryPaths(c.categoryPaths || [], result.existingCategories || [])
        const catIds = resolveCategoryIds(c.categories || [], result.existingCategories || [])
        const merged = [...new Set([...pathIds, ...catIds])]
        selections[i] = merged
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
    const updated = { ...contactSelections }
    const uncheckedCats = Object.entries(unknownChecks)
      .filter(([, checked]) => !checked)
      .map(([name]) => name)
    if (uncheckedCats.length > 0) {
      Object.entries(updated).forEach(([i, vals]) => {
        updated[i] = vals.filter(val => {
          if (val.startsWith('new:')) {
            return !uncheckedCats.includes(val.slice(4))
          }
          return true
        })
      })
    }
    setContactSelections(updated)
  }

  const toggleCategory = (index, value) => {
    setContactSelections(prev => {
      const cur = prev[index] || []
      const next = cur.includes(value)
        ? cur.filter(v => v !== value)
        : [...cur, value]
      return { ...prev, [index]: next }
    })
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
    setContactSelections(prev => {
      const updated = { ...prev }
      selectedContacts.forEach(i => {
        const cur = updated[i] || []
        if (batchCategory === 'clear') {
          updated[i] = []
        } else if (!cur.includes(batchCategory)) {
          updated[i] = [...cur, batchCategory]
        }
      })
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

      const contactsWithCategory = parsed.contacts.map((c, i) => {
        const sels = contactSelections[i] || []
        const catIds = sels.filter(s => !s.startsWith('new:')).map(Number)
        const newNames = sels.filter(s => s.startsWith('new:')).map(s => s.slice(4))
        return { ...c, _categoryIds: catIds, _categoryNames: newNames }
      })

      const result = await api.saveImport(contactsWithCategory, newCats)
      setImportResult({
        count: result.count,
        total: importResult?.total,
        newCategoriesCreated: result.newCategoriesCreated || []
      })
    } catch (err) {
      setError(`导入失败: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const getCategoryLabel = (vals, cats) => {
    if (!vals?.length) return '不设分类'
    return vals.map(val => {
      if (val.startsWith('new:')) {
        const name = val.slice(4)
        return unknownChecks[name] !== false ? `新建:${name}` : null
      }
      const cat = cats.find(c => String(c.id) === val)
      return cat?.name || null
    }).filter(Boolean).join(', ') || '不设分类'
  }

  const getSelectionSummary = (index) => {
    const vals = contactSelections[index] || []
    if (!vals.length) return '不设分类'
    const names = vals.map(v => {
      if (v.startsWith('new:')) return `+${v.slice(4)}`
      const cat = categories.find(c => String(c.id) === v)
      return cat?.name || v
    })
    return `${names.length} 个: ${names.join(', ')}`
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
                <option value="">批量追加分类...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                ))}
                <option value="clear">--- 清空分类 ---</option>
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
                  <th>网址</th>
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
                      {c.url ? <a href={c.url} target="_blank" rel="noopener" style={{ color: '#667eea' }}>{new URL(c.url).hostname}</a> : '-'}
                    </td>
                      <td className="cat-cell-import" style={{ cursor: 'pointer', position: 'relative' }}>
                        <div
                          onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                          style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {getSelectionSummary(i)}
                        </div>
                        {expandedRow === i && (
                          <div className="cat-import-dropdown" onClick={(e) => e.stopPropagation()}>
                            {categories.map((cat) => {
                              const checked = (contactSelections[i] || []).includes(String(cat.id))
                              return (
                                <label key={cat.id} className="cat-select-item" style={{ paddingLeft: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCategory(i, String(cat.id))}
                                  />
                                  <span>{cat.name}</span>
                                </label>
                              )
                            })}
                            {/* 未知分类选项 */}
                            {parsed.contacts[i].categories?.map((catName) => {
                              const exists = categories.some(dc => dc.name === catName)
                              if (!exists) {
                                const checked = (contactSelections[i] || []).includes(`new:${catName}`)
                                return (
                                  <label key={`new-${catName}`} className="cat-select-item" style={{ paddingLeft: 12, color: '#388e3c' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleCategory(i, `new:${catName}`)}
                                    />
                                    <span>新建: {catName}</span>
                                  </label>
                                )
                              }
                              return null
                            })}
                            <button
                              onClick={() => setExpandedRow(null)}
                              className="btn-sm"
                              style={{ width: '100%', marginTop: 4 }}
                            >
                              关闭
                            </button>
                          </div>
                        )}
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
