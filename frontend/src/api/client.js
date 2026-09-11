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

export const forgotPassword = (email) =>
  api.post('/auth/forgot-password', { email })

export const updateAvatar = (avatarUrl) =>
  api.post('/auth/avatar', { avatar_url: avatarUrl })

export const resetPassword = (token, newPassword) =>
  api.post('/auth/reset-password', { token, new_password: newPassword })

export const googleAuth    = (accessToken) =>
  api.post('/auth/google',    { access_token: accessToken })

export const facebookAuth  = (accessToken) =>
  api.post('/auth/facebook',  { access_token: accessToken })

export const instagramAuth = (accessToken) =>
  api.post('/auth/instagram', { access_token: accessToken })

export const linkedinAuth  = (code, redirectUri) =>
  api.post('/auth/linkedin',  { code, redirect_uri: redirectUri })

export const translateMessages = (texts, language) =>
  api.post('/chat/translate', { texts, language })

// ── Chats ─────────────────────────────────────────────────────────────────────

export const listChats = () => api.get('/chats/')

export const createChat = (title = 'New Chat') =>
  api.post('/chats/', { title })

export const getChat = id => api.get(`/chats/${id}`)

export const deleteChat       = id => api.delete(`/chats/${id}`)
export const renameChat       = (id, title) => api.patch(`/chats/${id}`, { title })
export const moveChatToFolder = (chatId, folderId) =>
  api.patch(`/chats/${chatId}/folder`, { folder_id: folderId ?? null })

// ── Folders ───────────────────────────────────────────────────────────────────

export const listFolders   = () => api.get('/folders/')
export const createFolder  = (name) => api.post('/folders/', { name })
export const renameFolder  = (id, name) => api.patch(`/folders/${id}`, { name })
export const deleteFolder  = (id) => api.delete(`/folders/${id}`)

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

export const generateDiagram = (prompt, currentCode) =>
  api.post('/diagrams/generate', { prompt, current_code: currentCode || null })

export const deleteDocument = id => api.delete(`/documents/${id}`)

// ── Image ─────────────────────────────────────────────────────────────────────

export const editImage = ({ image_url, prompt, lora_scale }) =>
  api.post('/image/edit', { image_url, prompt, lora_scale })

export const generateImage = ({ prompt, image_size = 'square' }) =>
  api.post('/image/generate', { prompt, image_size })

// Client-side image editing — calls HuggingFace directly from the browser so
// Vercel's 60s function timeout can't kill the request (HF takes 60-120s).
const _HF_PIX2PIX = 'https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix'
const _HF_SD15    = 'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5'

function _dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function _blobToDataUrl(blob) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.readAsDataURL(blob)
  })
}

async function _hfPost(modelUrl, imgBytes, prompt) {
  const res = await fetch(`${modelUrl}?prompt=${encodeURIComponent(prompt)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'X-Wait-For-Model': 'true' },
    body: imgBytes,
    signal: AbortSignal.timeout(150000), // 2.5 min per attempt
  })
  const ct = res.headers.get('content-type') || ''
  if (res.ok && ct.includes('image')) return res.blob()
  const text = await res.text().catch(() => '')
  const isBusy = res.status === 503
    || text.includes('Errno 16')
    || text.toLowerCase().includes('busy')
    || text.toLowerCase().includes('loading')
  const err = new Error(text.slice(0, 300) || `HTTP ${res.status}`)
  err.status = res.status
  err.isBusy = isBusy
  err.isRateLimit = res.status === 429
  throw err
}

export async function editImageClient(imageDataUrl, prompt, onStatus) {
  const imgBytes = _dataUrlToBytes(imageDataUrl)
  const models = [_HF_PIX2PIX, _HF_SD15]
  const MAX_RETRIES = 3

  for (let m = 0; m < models.length; m++) {
    const modelUrl = models[m]
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const wait = 20 + attempt * 15  // 35s, 50s
          onStatus?.(`Model busy — retrying in ${wait}s (attempt ${attempt + 1}/${MAX_RETRIES})…`)
          await new Promise(r => setTimeout(r, wait * 1000))
        }
        onStatus?.(m === 0 ? 'Sending to AI model…' : 'Trying fallback model…')
        const blob = await _hfPost(modelUrl, imgBytes, prompt)
        return await _blobToDataUrl(blob)
      } catch (err) {
        if (err.isRateLimit) throw new Error('Rate limit reached — wait a minute and try again.')
        if (!err.isBusy) throw err  // bad request, auth error etc — don't retry
        // busy: loop to next attempt
      }
    }
    onStatus?.('Primary model unavailable — switching to fallback…')
  }
  throw new Error('Both models are busy. Please try again in a few minutes.')
}

// ── Providers ─────────────────────────────────────────────────────────────────

export const getConfiguredProviders = () => api.get('/providers/configured')

export const getProviders = () => api.get('/providers/')

export const connectProvider = (provider) =>
  api.post('/providers/connect', { provider })

export const disconnectProvider = (provider) =>
  api.delete(`/providers/${provider}`)

// User-stored provider API keys (persisted in backend DB)
export const getMyProviderKeys  = () => api.get('/providers/my-keys')
export const saveProviderKey    = (provider, apiKey) =>
  api.post('/providers/key', { provider, api_key: apiKey })
export const deleteProviderKey  = (provider) =>
  api.delete(`/providers/key/${provider}`)

// ── Streaming chat ─────────────────────────────────────────────────────────────

export async function streamChat(
  { message, conversationHistory, documentIds, chatId, model, userApiKey, language, images },
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
        model: model || null,
        user_api_key: userApiKey || null,
        language: language || null,
        images: images?.length ? images : null,
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
  let receivedDone = false
  const TIMEOUT_MS = 55000 // 55s — just under Vercel's 60s function limit

  const timeoutId = setTimeout(() => {
    reader.cancel()
    onError?.('Request timed out. Please try again.')
  }, TIMEOUT_MS)

  try {
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
          else if (payload.type === 'done') {
            receivedDone = true
            onDone?.(payload.confidence)
          }
        } catch {
          // skip malformed SSE events
        }
      }
    }
  } finally {
    clearTimeout(timeoutId)
    // If the stream closed without a 'done' event (backend crash/timeout),
    // unblock the UI so the user is not stuck on "Generating..."
    if (!receivedDone) {
      onDone?.(null)
    }
  }
}
