const API_BASE = '/console/api/public'
let currentCategory = 'all'
let currentPage = 1
let totalPages = 1
let isSearching = false

// DOM 元素
const vcardGrid = document.getElementById('vcard-grid')
const searchInput = document.getElementById('search-input')
const filterTabs = document.querySelector('.filter-tabs')
const loading = document.getElementById('loading')
const emptyState = document.getElementById('empty-state')
const totalCountEl = document.getElementById('total-count')
const categoryCountEl = document.getElementById('category-count')
const loadMoreBtn = document.getElementById('load-more')

// 弹框
const modal = document.getElementById('download-modal')
const modalIcon = document.getElementById('modal-icon')
const modalTitle = document.getElementById('modal-title')
const modalOrgName = document.getElementById('modal-org-name')
const modalPhones = document.getElementById('modal-phones')
const modalUrl = document.getElementById('modal-url')
const modalEmails = document.getElementById('modal-emails')
const confirmDownloadBtn = document.getElementById('confirm-download')
const cancelDownloadBtn = document.getElementById('cancel-download')
const closeBtn = document.querySelector('.close')

let currentVCardData = null

document.addEventListener('DOMContentLoaded', function() {
  setupEventListeners()
  loadCategories()
  loadContacts()
})

function setupEventListeners() {
  searchInput.addEventListener('input', debounce(handleSearch, 300))
  confirmDownloadBtn.addEventListener('click', downloadVCard)
  cancelDownloadBtn.addEventListener('click', closeModal)
  closeBtn.addEventListener('click', closeModal)
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal() })
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal() })
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadMore)
  }
}

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function loadCategories() {
  try {
    const tree = await fetchJSON(`${API_BASE}/categories`)
    filterTabs.querySelectorAll('.filter-tab[data-category]:not([data-category="all"])').forEach(t => t.remove())

    const flatCats = flattenTree(tree)
    categoryCountEl.textContent = flatCats.length

    flatCats.forEach(cat => {
      const tab = document.createElement('button')
      tab.className = 'filter-tab'
      tab.dataset.category = cat.id
      tab.textContent = cat.name
      tab.addEventListener('click', () => handleCategoryFilter(cat.id))
      filterTabs.appendChild(tab)
    })
  } catch (err) {
    console.error('加载分类失败:', err)
  }
}

function flattenTree(nodes, depth = 0) {
  const result = []
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth })
    if (node.children?.length) {
      result.push(...flattenTree(node.children, depth + 1))
    }
  }
  return result
}

async function loadContacts(page = 1) {
  loading.style.display = 'block'
  try {
    const params = new URLSearchParams({ page, pageSize: 20 })
    if (currentCategory !== 'all') {
      params.set('categoryId', currentCategory)
      params.set('includeChildren', 'true')
    }
    if (searchInput.value.trim()) {
      params.set('search', searchInput.value.trim())
    }

    const data = await fetchJSON(`${API_BASE}/contacts?${params}`)
    totalCountEl.textContent = data.total

    if (page === 1) {
      vcardGrid.innerHTML = ''
    }

    data.contacts.forEach(card => createVCardElement(card))

    currentPage = page
    totalPages = Math.ceil(data.total / 20)

    if (data.contacts.length === 0 && page === 1) {
      showEmptyState()
    } else {
      hideEmptyState()
    }

    if (loadMoreBtn) {
      loadMoreBtn.style.display = currentPage < totalPages ? 'block' : 'none'
    }
  } catch (err) {
    console.error('加载联系人失败:', err)
    if (page === 1) showEmptyState()
  } finally {
    loading.style.display = 'none'
  }
}

function createVCardElement(vcard) {
  const cardDiv = document.createElement('div')
  cardDiv.className = 'vcard-item'
  cardDiv.addEventListener('click', () => showDownloadModal(vcard))

  const iconUrl = vcard.imagePath || `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iOCIgZmlsbD0iI0Y4RjlGQSIvPgo8cGF0aCBkPSJNMjQgMTJBNiA2IDAgMCAxIDMwIDE4QTYgNiAwIDAgMSAyNCAyNEE2IDYgMCAwIDEgMTggMThBNiA2IDAgMCAxIDI0IDEyWiIgZmlsbD0iIzY2NyIvPgo8cGF0aCBkPSJNMTIgMzZWMzRBNiA2IDAgMCAxIDE4IDI4SDMwQTYgNiAwIDAgMSAzNiAzNFYzNiIgZmlsbD0iIzY2NyIvPgo8L3N2Zz4K`
  const orgName = vcard.organization

  const catPath = vcard.categoryPaths?.length
    ? vcard.categoryPaths.join(', ')
    : ''

  const phones = vcard.phones || []
  const emails = vcard.emails || []

  cardDiv.innerHTML = `
    <div class="vcard-header">
      <img src="${iconUrl}" alt="${orgName}" class="vcard-icon"
           onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiByeD0iOCIgZmlsbD0iI0Y4RjlGQSIvPgo8cGF0aCBkPSJNMjQgMTJBNiA2IDAgMCAxIDMwIDE4QTYgNiAwIDAgMSAyNCAyNEE2IDYgMCAwIDEgMTggMThBNiA2IDAgMCAxIDI0IDEyWiIgZmlsbD0iIzY2NyIvPgo8cGF0aCBkPSJNMTIgMzZWMzRBNiA2IDAgMCAxIDE4IDI4SDMwQTYgNiAwIDAgMSAzNiAzNFYzNiIgZmlsbD0iIzY2NyIvPgo8L3N2Zz4K'">
      <div>
        <h3 class="vcard-title">${orgName}</h3>
        ${catPath ? `<span class="vcard-category">${catPath}</span>` : ''}
      </div>
    </div>
    <div class="vcard-info">
      ${phones.length > 0 ? `
        <div class="vcard-phones">
          ${phones.slice(0, 3).map(p => {
            const label = p.label ? `(${p.label})` : ''
            return `<span class="phone-item">${p.number} ${label}</span>`
          }).join('')}
          ${phones.length > 3 ? `<span class="phone-item">+${phones.length - 3}</span>` : ''}
        </div>
      ` : ''}
      ${vcard.url ? `
        <a href="${vcard.url}" class="vcard-url" onclick="event.stopPropagation();" target="_blank" rel="noopener">
          ${formatUrl(vcard.url)}
        </a>
      ` : ''}
    </div>
  `

  vcardGrid.appendChild(cardDiv)
  return cardDiv
}

function formatUrl(url) {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch { return url }
}

function handleCategoryFilter(categoryId) {
  currentCategory = String(categoryId)
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'))

  const activeTab = categoryId === 'all'
    ? document.querySelector('[data-category="all"]')
    : document.querySelector(`[data-category="${categoryId}"]`)
  if (activeTab) activeTab.classList.add('active')

  currentPage = 1
  loadContacts(1)
}

function handleSearch() {
  currentPage = 1
  loadContacts(1)
}

function loadMore() {
  loadContacts(currentPage + 1)
}

function showDownloadModal(vcard) {
  currentVCardData = vcard

  const iconUrl = vcard.imagePath || 'data:image/svg+xml;base64,...'
  modalIcon.src = iconUrl
  modalTitle.textContent = vcard.organization
  modalOrgName.textContent = vcard.organization

  if (vcard.phones?.length) {
    modalPhones.innerHTML = `
      <strong>📞 电话：</strong>
      ${vcard.phones.map(p => {
        const label = p.label ? ` <small style="color:#888">(${p.label})</small>` : ''
        return `<span class="phone-item">${p.number}${label}</span>`
      }).join('')}
    `
    modalPhones.style.display = 'block'
  } else {
    modalPhones.style.display = 'none'
  }

  if (vcard.url) {
    modalUrl.innerHTML = `<strong>🌐 官网：</strong><a href="${vcard.url}" target="_blank">${vcard.url}</a>`
    modalUrl.style.display = 'block'
  } else {
    modalUrl.style.display = 'none'
  }

  if (vcard.emails?.length) {
    modalEmails.innerHTML = `
      <strong>✉️ 邮箱：</strong>
      ${vcard.emails.map(e => {
        const label = e.label ? ` <small style="color:#888">(${e.label})</small>` : ''
        return `<span class="phone-item">${e.email}${label}</span>`
      }).join(', ')}
    `
    modalEmails.style.display = 'block'
  } else {
    modalEmails.style.display = 'none'
  }

  modal.style.display = 'block'
  document.body.style.overflow = 'hidden'
}

function closeModal() {
  modal.style.display = 'none'
  document.body.style.overflow = 'auto'
  currentVCardData = null
}

function downloadVCard() {
  if (!currentVCardData) return
  const url = `/console/api/vcf/download/${currentVCardData.id}`
  const link = document.createElement('a')
  link.href = url
  link.download = `${currentVCardData.organization}.vcf`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  closeModal()
}

function showEmptyState() {
  vcardGrid.style.display = 'none'
  emptyState.style.display = 'block'
}

function hideEmptyState() {
  vcardGrid.style.display = 'grid'
  emptyState.style.display = 'none'
}

function debounce(func, wait) {
  let timeout
  return function(...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), wait)
  }
}
