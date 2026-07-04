const API_BASE = '/console/api'

let authToken = localStorage.getItem('token')

export function setToken(token) {
  authToken = token
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
}

export function getToken() {
  return authToken
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers })

  let data
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    const text = await res.text()
    throw new Error(`服务器返回异常 (${res.status}): ${text.slice(0, 100)}`)
  }

  if (!res.ok) throw new Error(data?.error || `请求失败 (${res.status})`)
  return data
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getContacts: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/contacts?${qs}`)
  },

  getContact: (id) => request(`/contacts/${id}`),

  createContact: (data) =>
    request('/contacts', { method: 'POST', body: JSON.stringify(data) }),

  updateContact: (id, data) =>
    request(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteContact: (id) =>
    request(`/contacts/${id}`, { method: 'DELETE' }),

  getCategories: () => request('/categories'),

  createCategory: (name) =>
    request('/categories', { method: 'POST', body: JSON.stringify({ name }) }),

  updateCategory: (id, data) =>
    request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteCategory: (id, migrateTo) => {
    const qs = migrateTo ? `?migrateTo=${migrateTo}` : ''
    return request(`/categories/${id}${qs}`, { method: 'DELETE' })
  },

  importVcf: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE}/vcf/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData
    }).then(r => r.json())
  },

  saveImport: (contacts, newCategories = []) =>
    request('/vcf/import/save', { method: 'POST', body: JSON.stringify({ contacts, newCategories }) }),

  publish: () =>
    request('/vcf/publish', { method: 'POST' }),

  uploadImage: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE}/upload/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData
    }).then(r => r.json())
  },

  getVcfDownloadUrl: (id) => `${API_BASE}/vcf/download/${id}?token=${encodeURIComponent(authToken || '')}`,

  getVcfAllUrl: () => `${API_BASE}/vcf/download?token=${encodeURIComponent(authToken || '')}`
}
