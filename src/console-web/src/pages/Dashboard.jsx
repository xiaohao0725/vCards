import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Dashboard() {
  const [contacts, setContacts] = useState([])
  const [categories, setCategories] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const navigate = useNavigate()

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getContacts({ search, categoryId, status, page, pageSize: 20 })
      setContacts(data.contacts)
      setTotal(data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, categoryId, status, page])

  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error)
  }, [])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const handlePublishAll = async () => {
    if (!window.confirm('确定将所有草稿标记为已发布？')) return
    setPublishing(true)
    try {
      const result = await api.publishAll()
      alert(`已发布 ${result.published} 个联系人`)
      loadContacts()
    } catch (err) {
      alert(`失败: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  const handlePublish = async () => {
    if (!window.confirm('确定要从已发布的联系人生成 VCF 文件吗？')) return
    setPublishing(true)
    try {
      const result = await api.publish()
      alert(`生成完成: 成功 ${result.success}，失败 ${result.failures}`)
    } catch (err) {
      alert(`发布失败: ${err.message}`)
    } finally {
      setPublishing(false)
    }
  }

  const handleDelete = async (id, org) => {
    if (!window.confirm(`确定删除「${org}」吗？此操作不可恢复。`)) return
    try {
      await api.deleteContact(id)
      loadContacts()
    } catch (err) {
      alert(`删除失败: ${err.message}`)
    }
  }

  const handleToggleStatus = async (contact) => {
    const newStatus = contact.status === 'published' ? 'draft' : 'published'
    try {
      await api.updateContact(contact.id, { status: newStatus })
      loadContacts()
    } catch (err) {
      alert(`操作失败: ${err.message}`)
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="dashboard">
      <div className="toolbar">
        <div className="toolbar-left">
          <input
            type="text"
            placeholder="搜索组织名称或电话..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="search-input"
          />
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }}>
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
          </select>
        </div>
        <div className="toolbar-right">
          <button onClick={handlePublishAll} disabled={publishing} className="btn-primary" style={{ background: '#388e3c' }}>
            {publishing ? '...' : '全部发布'}
          </button>
          <button onClick={handlePublish} disabled={publishing} className="btn-primary">
            {publishing ? '生成中...' : '发布 VCF'}
          </button>
          <a href={api.getVcfAllUrl()} className="btn-secondary" target="_blank" rel="noopener">
            下载全部
          </a>
        </div>
      </div>

      <div className="stats-bar">
        共 {total} 个联系人
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <table className="contact-table">
            <thead>
              <tr>
                <th>组织名称</th>
                <th>分类</th>
                <th>电话</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="contact-name">
                      {c.imagePath && (
                        <img src={c.imagePath} alt="" className="contact-thumb" />
                      )}
                      <span>{c.organization}</span>
                    </div>
                  </td>
                  <td>{c.categories?.map(cc => cc.category?.name).filter(Boolean).join(', ') || '-'}</td>
                  <td>{c.phones?.slice(0, 2).map(p => p.number).join(', ') || '-'}</td>
                  <td>
                    <span className={`status-badge status-${c.status}`}>
                      {c.status === 'published' ? '已发布' : '草稿'}
                    </span>
                  </td>
                  <td>{new Date(c.updatedAt).toLocaleDateString('zh-CN')}</td>
                  <td className="actions">
                    <button onClick={() => navigate(`/${c.id}/edit`)} className="btn-sm">编辑</button>
                    <button onClick={() => handleToggleStatus(c)} className="btn-sm">
                      {c.status === 'published' ? '下架' : '发布'}
                    </button>
                    <a href={api.getVcfDownloadUrl(c.id)} className="btn-sm" target="_blank">VCF</a>
                    <button onClick={() => handleDelete(c.id, c.organization)} className="btn-sm btn-danger">删除</button>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr><td colSpan={6} className="empty-row">暂无联系人</td></tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
