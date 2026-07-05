import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../api'

function buildFlatList(treeList, depth = 0) {
  const result = []
  for (const node of treeList) {
    result.push({ ...node, depth })
    if (node.children?.length) {
      result.push(...buildFlatList(node.children, depth + 1))
    }
  }
  return result
}

export default function CategorySelect({ value, onChange, placeholder }) {
  const [tree, setTree] = useState([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    api.getCategories({ tree: 'true' }).then(setTree).catch(() => {})
  }, [])

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const idSet = useMemo(() => new Set(value || []), [value])
  const flatList = useMemo(() => buildFlatList(tree), [tree])
  const filtered = search ? flatList.filter(c => c.name.includes(search)) : flatList

  const selectedNames = flatList.filter(c => idSet.has(c.id)).map(c => c.name)

  const toggle = (id) => {
    const next = idSet.has(id) ? value.filter(v => v !== id) : [...(value || []), id]
    onChange(next)
  }

  const remove = (id) => {
    onChange((value || []).filter(v => v !== id))
  }

  return (
    <div className="cat-select" ref={ref}>
      <div className="cat-select-trigger" onClick={() => setOpen(!open)}>
        {selectedNames.length > 0 ? (
          <div className="cat-select-tags">
            {selectedNames.map((name, i) => (
              <span key={i} className="cat-select-tag">
                {name}
                <button type="button" className="cat-tag-remove" onClick={(e) => { e.stopPropagation(); remove(value.find(v => flatList.find(c => c.id === v)?.name === name)) }}>×</button>
              </span>
            ))}
          </div>
        ) : (
          <span className="cat-select-placeholder">{placeholder || '选择分类'}</span>
        )}
        <span className="cat-select-arrow">▼</span>
      </div>
      {open && (
        <div className="cat-select-dropdown">
          <input
            type="text"
            className="cat-select-search"
            placeholder="搜索分类..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="cat-select-list">
            {filtered.map((c) => (
              <label
                key={c.id}
                className="cat-select-item"
                style={{ paddingLeft: 12 + c.depth * 16 }}
              >
                <input
                  type="checkbox"
                  checked={idSet.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span>{c.name}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="cat-select-empty">无匹配分类</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
