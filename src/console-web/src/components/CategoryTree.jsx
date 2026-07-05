import { useState } from 'react'

export default function CategoryTree({ nodes, depth = 0, editingId, editName, onEdit, onSave, onCancel, onDelete, onCreateChild }) {
  const [expanded, setExpanded] = useState({})

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return nodes.map((node) => (
    <div key={node.id}>
      <div className="cat-tree-row" style={{ paddingLeft: 12 + depth * 24 }}>
        <span
          className="cat-tree-toggle"
          onClick={() => node.children?.length ? toggleExpand(node.id) : null}
          style={{ visibility: node.children?.length ? 'visible' : 'hidden' }}
        >
          {expanded[node.id] ? '▼' : '▶'}
        </span>

        {editingId === node.id ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={(e) => onEdit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSave(node.id)}
              className="cat-tree-input"
              autoFocus
            />
            <button onClick={() => onSave(node.id)} className="btn-sm" style={{ marginLeft: 4 }}>保存</button>
            <button onClick={onCancel} className="btn-sm" style={{ marginLeft: 4 }}>取消</button>
          </>
        ) : (
          <>
            <span className="cat-tree-name">{node.name}</span>
            <span className="cat-tree-stats">
              {node._count?.contacts > 0 && <span className="cat-stat">{node._count.contacts} 联系人</span>}
              {node._count?.children > 0 && <span className="cat-stat">{node._count.children} 子分类</span>}
            </span>
            <span className="cat-tree-actions">
              <button onClick={() => onCreateChild(node.id)} className="btn-sm">+子</button>
              <button onClick={() => onEdit(node.name, node.id)} className="btn-sm">编辑</button>
              <button onClick={() => onDelete(node)} className="btn-sm btn-danger">删除</button>
            </span>
          </>
        )}
      </div>

      {node.children?.length > 0 && expanded[node.id] && (
        <CategoryTree
          nodes={node.children}
          depth={depth + 1}
          editingId={editingId}
          editName={editName}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          onDelete={onDelete}
          onCreateChild={onCreateChild}
        />
      )}
    </div>
  ))
}
