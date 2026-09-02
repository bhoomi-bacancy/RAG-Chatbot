import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({ baseURL: BASE_URL })

// Request interceptor: attach Bearer token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('inkira_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('inkira_token')
      localStorage.removeItem('inkira_user')
      window.__authExpired = true
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = (email, password) =>
  api.post('/auth/login', { email, password })

export const register = (email, name, password) =>
  api.post('/auth/register', { email, name, password })

export const getMe = () => api.get('/auth/me')

export const logout = () => {
  localStorage.removeItem('inkira_token')
  localStorage.removeItem('inkira_user')
}

// ── Chats ─────────────────────────────────────────────────────────────────────

export const listChats = () => api.get('/chats/')

export const createChat = (title = 'New Chat') =>
  api.post('/chats/', { title })

export const getChat = id => api.get(`/chats/${id}`)

export const deleteChat  = id => api.delete(`/chats/${id}`)
export const renameChat  = (id, title) => api.patch(`/chats/${id}`, { title })

// ── Documents ─────────────────────────────────────────────────────────────────

export const uploadDocument = (file, chatId, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  if (chatId) form.append('chat_id', chatId)
  return api.post('/documents/upload', form, {
    onUploadProgress: e =>
      onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  })
}

export const listDocuments = () => api.get('/documents/')

export const deleteDocument = id => api.delete(`/documents/${id}`)

// ── Streaming chat ─────────────────────────────────────────────────────────────

export async function streamChat(
  { message, conversationHistory, documentIds, chatId },
  callbacks
) {
  const { onSources, onToken, onDone, onError } = callbacks

  const token = localStorage.getItem('inkira_token')

  let response
  try {
    response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        conversation_history: conversationHistory,
        document_ids: documentIds?.length ? documentIds : null,
        chat_id: chatId || null,
      }),
    })
  } catch (networkErr) {
    onError?.('Network error — could not reach the server.')
    return
  }

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('inkira_token')
      localStorage.removeItem('inkira_user')
      window.__authExpired = true
    }
    const err = await response.json().catch(() => ({}))
    onError?.(err.detail || `Request failed (${response.status})`)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()

    for (const part of parts) {
      if (!part.startsWith('data: ')) continue
      try {
        const payload = JSON.parse(part.slice(6))
        if (payload.type === 'sources') onSources?.(payload.data)
        else if (payload.type === 'token') onToken?.(payload.data)
        else if (payload.type === 'done') onDone?.(payload.confidence)
      } catch {
        // skip malformed SSE events
      }
    }
  }
}
