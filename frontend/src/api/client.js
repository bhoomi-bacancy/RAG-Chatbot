import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const uploadDocument = (file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/documents/upload', form, {
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  })
}

export const listDocuments = () => api.get('/documents/')

export const deleteDocument = id => api.delete(`/documents/${id}`)

export async function streamChat({ message, conversationHistory, documentIds }, callbacks) {
  const { onSources, onToken, onDone, onError } = callbacks

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      document_ids: documentIds?.length ? documentIds : null,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    onError?.(err.detail || 'Request failed')
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
        // skip malformed events
      }
    }
  }
}
