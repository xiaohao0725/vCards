import { useState, useEffect } from 'react'
import { api } from '../api'
import CategoryTree from '../components/CategoryTree'

export default function Categories() {
  const [tree, setTree] = useState([])
  const [flatList, setFlatList] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [migrateTo, setMigrateTo] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [treeData, flatData] = await Promise.all([
        api.getCategoryTree(),
        api.getCategories()
      ])
      setTree(treeData)
      setFlatList(flatData)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e, parentId) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.createCategory(newName.trim(), parentId || null)
      setNewName('')
      setNewParentId('')
      load()
    } catch (err) { setError(err.message) }
  }

  const handleStartEdit = (name, id) => {
    setEditingId(id)
    setEditName(name)
  }

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return
    try {
      await api.updateCategory(id, { name: editName.trim() })
      setEditingId(null)
      setEditName('')
      load()
    } catch (err) { setError(err.message) }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditName('')
  }

  const handleOpenChildCreate = (parentId) => {
    setNewParentId(parentId)
    document.getElementById('cat-new-name')?.focus()
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

  if (loading) return <div className="loading">加载中...</div>

  return (
    <div className="editor">
      <h2>分类管理（支持多级树形）</h2>

      {error && <div className="error-msg">{error}</div>}

      {/* 新建根分类 */}
      <form onSubmit={(e) => handleCreate(e, null)} className="cat-create-form" style={{ marginBottom: 16 }}>
        <input
          id="cat-new-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={newParentId ? `为「${flatList.find(c => c.id === Number(newParentId))?.name || ''}」添加子分类` : '新分类名称'}
          style={{ width: 260 }}
        />
        <button type="submit" className="btn-primary" style={{ marginLeft: 8 }}>添加</button>
        {newParentId && (
          <button type="button" onClick={() => setNewParentId('')} className="btn-sm" style={{ marginLeft: 8 }}>取消子分类→添加根分类</button>
        )}
      </form>

      <div className="cat-tree-container">
        <div className="cat-tree-header">
          <span className="cat-tree-th" style={{ flex: 2 }}>分类名称</span>
          <span className="cat-tree-th" style={{ flex: 1 }}>统计</span>
          <span className="cat-tree-th" style={{ width: 150 }}>操作</span>
        </div>

        {tree.length > 0 ? (
          <CategoryTree
            nodes={tree}
            editingId={editingId}
            editName={editName}
            onEdit={handleStartEdit}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
            onDelete={(cat) => setDeleteTarget(cat)}
            onCreateChild={handleOpenChildCreate}
          />
        ) : (
          <div className="loading" style={{ padding: 20 }}>暂无分类，请添加</div>
        )}
      </div>

      {/* 删除弹窗 */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>删除分类「{deleteTarget.name}」</h3>
            {deleteTarget._count?.children > 0 && (
              <p style={{ color: '#e67e22' }}>该分类下有 <strong>{deleteTarget._count.children}</strong> 个子分类，将自动提升到上级。</p>
            )}
            {deleteTarget._count?.contacts > 0 ? (
              <>
                <p>该分类下有 <strong>{deleteTarget._count.contacts}</strong> 个联系人，请选择迁移目标：</p>
                <select value={migrateTo} onChange={(e) => setMigrateTo(e.target.value)} style={{ width: '100%', margin: '12px 0' }}>
                  <option value="">请选择目标分类</option>
                  {flatList.filter(c => c.id !== deleteTarget.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="form-actions">
                  <button onClick={handleDelete} disabled={!migrateTo} className="btn-primary">确认迁移并删除</button>
                  <button onClick={() => setDeleteTarget(null)} className="btn-secondary">取消</button>
                </div>
              </>
            ) : (
              <>
                <p>该分类下没有联系人，可直接删除。</p>
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
