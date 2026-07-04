import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [migrateTo, setMigrateTo] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getCategories()
      setCategories(data)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.createCategory(newName.trim())
      setNewName('')
      load()
    } catch (err) { setError(err.message) }
  }

  const handleEdit = (cat) => {
    setEditingId(cat.id)
    setEditName(cat.name)
  }

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return
    try {
      await api.updateCategory(id, { name: editName.trim() })
      setEditingId(null)
      load()
    } catch (err) { setError(err.message) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteCategory(deleteTarget.id, migrateTo || undefined)
      setDeleteTarget(null)
      setMigrateTo('')
      load()
    } catch (err) { setError(err.message) }
  }

  const openDelete = (cat) => {
    setDeleteTarget(cat)
    setMigrateTo('')
    setError('')
  }

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div className="editor">
      <h2>分类管理</h2>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleCreate} className="array-row" style={{ marginBottom: 20 }}>
        <input
          type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="新分类名称" style={{ flex: 2 }}
        />
        <button type="submit" className="btn-primary">添加</button>
      </form>

      <table className="contact-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>联系人数量</th>
            <th>排序</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>
                {editingId === c.id ? (
                  <input
                    type="text" value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(c.id)}
                    autoFocus
                    style={{ width: '100%' }}
                  />
                ) : (
                  c.name
                )}
              </td>
              <td>{c._count?.contacts ?? 0}</td>
              <td>{c.sortOrder}</td>
              <td className="actions">
                {editingId === c.id ? (
                  <>
                    <button onClick={() => handleSaveEdit(c.id)} className="btn-sm">保存</button>
                    <button onClick={() => setEditingId(null)} className="btn-sm">取消</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleEdit(c)} className="btn-sm">编辑</button>
                    <button onClick={() => openDelete(c)} className="btn-sm btn-danger">删除</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {categories.length === 0 && (
            <tr><td colSpan={4} className="empty-row">暂无分类</td></tr>
          )}
        </tbody>
      </table>

      {/* 删除迁移弹窗 */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>删除分类「{deleteTarget.name}」</h3>
            {deleteTarget._count?.contacts > 0 ? (
              <>
                <p>该分类下有 <strong>{deleteTarget._count.contacts}</strong> 个联系人，请选择迁移目标：</p>
                <select
                  value={migrateTo}
                  onChange={(e) => setMigrateTo(e.target.value)}
                  style={{ width: '100%', margin: '12px 0' }}
                >
                  <option value="">请选择目标分类</option>
                  {categories.filter(c => c.id !== deleteTarget.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}（{c._count?.contacts ?? 0}）</option>
                  ))}
                </select>
                <div className="form-actions">
                  <button onClick={handleDelete} disabled={!migrateTo} className="btn-primary">确认迁移并删除</button>
                  <button onClick={() => setDeleteTarget(null)} className="btn-secondary">取消</button>
                </div>
              </>
            ) : (
              <>
                <p>该分类下没有联系人，可以直接删除。</p>
                <div className="form-actions">
                  <button onClick={handleDelete} className="btn-danger">确认删除</button>
                  <button onClick={() => setDeleteTarget(null)} className="btn-secondary">取消</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
