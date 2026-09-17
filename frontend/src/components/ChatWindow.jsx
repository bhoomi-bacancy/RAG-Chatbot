import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUp, Paperclip, X, Loader2, Sparkles, MessageSquare, FileText, ChevronDown, ImagePlus, Menu, Download, Share2, Check, Link } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { streamChat, getChat, createChat, uploadDocument, renameChat, getConfiguredProviders, getMyProviderKeys, deleteProviderKey, translateMessages, getSuggestions, shareChat, unshareChat, extractMemory } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import MessageBubble from './MessageBubble'
import ModelPickerModal, { MODELS, PROVIDERS } from './ModelPickerModal'
import ConnectProviderModal from './ConnectProviderModal'
import VoiceButton from './VoiceButton'

let msgId = 0
const nextId = () => ++msgId

function getProviderForModel(modelId) {
  if (!modelId) return 'groq'
  if (modelId.startsWith('gpt-')) return 'openai'
  if (modelId.startsWith('claude-')) return 'anthropic'
  if (modelId.startsWith('gemini-')) return 'google'
  if (modelId.startsWith('ollama/')) return 'ollama'
  return 'groq'
}

/* ── File card helpers ────────────────────────────────────────────────────── */
function fileTypeStyle(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase()
  if (ext === 'pdf')
    return { bg: 'bg-red-50', icon: 'text-red-500', border: 'border-red-100', label: 'PDF' }
  if (ext === 'docx' || ext === 'doc')
    return { bg: 'bg-blue-50', icon: 'text-blue-500', border: 'border-blue-100', label: ext.toUpperCase() }
  return { bg: 'bg-zinc-100', icon: 'text-zinc-500', border: 'border-zinc-200', label: ext.toUpperCase() }
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function AttachmentChip({ name, size, onRemove }) {
  const { bg, icon, border, label } = fileTypeStyle(name)
  return (
    <div className={`flex items-center gap-2.5 ${bg} border ${border} rounded-xl px-3 py-2 min-w-0 max-w-[200px]`}>
      <div className={`shrink-0 ${icon}`}><FileText className="w-5 h-5" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-800 truncate leading-tight">{name}</p>
        <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">{label}{size ? ` · ${size}` : ''}</p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-300 hover:bg-zinc-400 text-zinc-600 transition"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

/* ── ShareModal ────────────────────────────────────────────────────────────── */
function ShareModal({ chatId, onClose }) {
  const [token, setToken]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    shareChat(chatId)
      .then(({ data }) => setToken(data.token))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [chatId])

  const shareLink = token ? `${window.location.origin}/shared/${token}` : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const handleUnshare = async () => {
    try {
      await unshareChat(chatId)
      setToken(null)
    } catch {}
  }

  const handleReshare = async () => {
    setLoading(true)
    try {
      const { data } = await shareChat(chatId)
      setToken(data.token)
    } catch {}
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-xl w-full max-w-md p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 bg-orange-100 dark:bg-orange-950 rounded-xl flex items-center justify-center">
            <Share2 className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Share Conversation</h3>
            <p className="text-xs text-zinc-400">Anyone with the link can view this chat</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
          </div>
        ) : token ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2.5">
              <Link className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                readOnly
                value={shareLink}
                className="flex-1 bg-transparent text-xs text-zinc-600 dark:text-zinc-400 outline-none truncate"
                onFocus={e => e.target.select()}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium py-2.5 rounded-xl transition"
              >
                {copied ? <Check className="w-4 h-4" /> : <Link className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                onClick={handleUnshare}
                className="px-3 py-2.5 rounded-xl text-sm text-zinc-500 dark:text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition"
                title="Remove share link"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">This chat is not currently shared.</p>
            <button
              onClick={handleReshare}
              className="w-full flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium py-2.5 rounded-xl transition"
            >
              <Share2 className="w-4 h-4" />
              Create share link
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatWindow({ chatId, onChatCreated, chats, setChats, onOpenDocuments, freshlyConnectedProvider, onOpenSidebar }) {
  const { user, updateUser } = useAuth()
  const { t } = useTranslation()
  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [loadingChat, setLoadingChat]     = useState(false)
  const [selectedModel, setSelectedModel] = useState('groq/llama-3.1-8b-instant')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [connectedProviders, setConnectedProviders] = useState([])
  const [connectedProviderKeys, setConnectedProviderKeys] = useState({})
  const [connectingProvider, setConnectingProvider] = useState(null)
  const [pendingModel, setPendingModel] = useState(null)  // model user tried to select before connecting
  const [platformProviders, setPlatformProviders] = useState(['groq'])

  const [attachedImages, setAttachedImages] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showShare, setShowShare] = useState(false)

  const scrollRef      = useRef(null)
  const textareaRef    = useRef(null)
  const fileInputRef   = useRef(null)
  const imageInputRef  = useRef(null)
  const skipReloadRef  = useRef(false)
  const isSendingRef   = useRef(false)  // synchronous guard — prevents double-send
  const lastUserMsgRef = useRef(null)   // ref to last user message element
  const prevLengthRef  = useRef(0)      // tracks message count for detecting new pairs
  const chatsRef       = useRef(chats)  // always-current chats list for use inside callbacks
  const messagesRef    = useRef([])     // always-current messages list for language-change effect
  const prevLangRef    = useRef(i18n.language)
  const originalMsgsRef = useRef({})   // { id: original_content } — source of truth for re-translation
  const aiResponseRef  = useRef('')     // accumulates streaming AI response for memory extraction

  // Keep chatsRef and messagesRef current so callbacks always see the latest state
  useEffect(() => { chatsRef.current = chats }, [chats])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Re-translate existing assistant messages when the user switches language
  useEffect(() => {
    const prevLang = prevLangRef.current
    const newLang = i18n.language
    if (prevLang === newLang) return
    prevLangRef.current = newLang

    const msgs = messagesRef.current
    const assistantMsgs = msgs.filter(m => m.role === 'assistant' && m.content && !m.streaming)
    if (!assistantMsgs.length) return

    // Ensure every visible message has its original saved (in case it was generated in-session)
    assistantMsgs.forEach(m => {
      if (!originalMsgsRef.current[m.id]) originalMsgsRef.current[m.id] = m.content
    })

    if (newLang === 'en') {
      // Restore originals instead of translating back
      setMessages(prev => prev.map(m =>
        m.role === 'assistant' && originalMsgsRef.current[m.id]
          ? { ...m, content: originalMsgsRef.current[m.id] }
          : m
      ))
      return
    }

    // Always translate from originals so En→Hi→Es stays accurate
    translateMessages(
      assistantMsgs.map(m => originalMsgsRef.current[m.id] || m.content),
      newLang,
    ).then(({ data }) => {
      const { translations } = data
      if (!Array.isArray(translations) || translations.length !== assistantMsgs.length) return
      const idMap = {}
      assistantMsgs.forEach((m, i) => { idMap[m.id] = translations[i] })
      setMessages(prev => prev.map(m => idMap[m.id] !== undefined ? { ...m, content: idMap[m.id] } : m))
    }).catch(() => {})
  }, [i18n.language])

  // If Google OAuth just completed, refresh keys from backend
  useEffect(() => {
    if (freshlyConnectedProvider) {
      getMyProviderKeys()
        .then(({ data }) => setConnectedProviders(data.connected || []))
        .catch(() => {})
    }
  }, [freshlyConnectedProvider])

  // On mount: load which providers are platform-configured AND which the user has connected
  useEffect(() => {
    getConfiguredProviders()
      .then(({ data }) => setPlatformProviders(data.configured || ['groq']))
      .catch(() => setPlatformProviders(['groq']))

    getMyProviderKeys()
      .then(({ data }) => {
        setConnectedProviders(data.connected || [])
        if (data.keys) setConnectedProviderKeys(data.keys)
      })
      .catch(() => {})
  }, [])

  /* ── Load chat history ──────────────────────────────────────────────────── */
  useEffect(() => {
    setSuggestions([])
    if (!chatId) { setMessages([]); return }
    if (skipReloadRef.current) { skipReloadRef.current = false; return }
    setLoadingChat(true)
    getChat(chatId)
      .then(({ data }) => {
        const loaded = (data.messages || []).map(m => ({
          id: nextId(), role: m.role, content: m.content,
          sources: [], confidence: undefined, streaming: false,
          attachments: m.attachments || [],
        }))
        // Store server content as originals (server returns English by default)
        loaded.forEach(m => {
          if (m.role === 'assistant' && m.content) originalMsgsRef.current[m.id] = m.content
        })
        setMessages(loaded)
        // Translate on load when language is already non-English
        const lang = i18n.language
        if (lang !== 'en') {
          const assistantMsgs = loaded.filter(m => m.role === 'assistant' && m.content)
          if (assistantMsgs.length) {
            translateMessages(assistantMsgs.map(m => m.content), lang)
              .then(({ data: tData }) => {
                if (!Array.isArray(tData.translations) || tData.translations.length !== assistantMsgs.length) return
                const idMap = {}
                assistantMsgs.forEach((m, i) => { idMap[m.id] = tData.translations[i] })
                setMessages(prev => prev.map(m => idMap[m.id] !== undefined ? { ...m, content: idMap[m.id] } : m))
              })
              .catch(() => {})
          }
        }
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingChat(false))
  }, [chatId])

  /* ── Auto-scroll ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const lastMsg = messages[messages.length - 1]
    const newPair = messages.length > prevLengthRef.current

    if (!newPair) return  // no scroll during streaming — user reads from the start

    prevLengthRef.current = messages.length
    if (lastMsg?.streaming) {
      // New response starting: scroll the user's message to the top so they
      // read the AI reply from the very beginning, not the end.
      requestAnimationFrame(() => {
        lastUserMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } else {
      // History loaded on chat switch: show the most recent messages.
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    }
  }, [messages])

  const conversationHistory = messages
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: m.content }))

  /* ── Send message ───────────────────────────────────────────────────────── */
  const sendMessage = useCallback(async text => {
    const hasFiles = attachedFiles.length > 0 || attachedImages.length > 0
    if (!text.trim() && !hasFiles) return
    if (isSendingRef.current) return
    isSendingRef.current = true

    // ── 1. Instant UI feedback — clear input and show spinner immediately ──
    const trimmed = text.trim() || (attachedFiles.length > 0 ? 'Please summarize and analyze this document.' : 'What is in this image?')
    const snapshot = attachedFiles.slice()
    const attachments = snapshot.map(f => ({ name: f.name, size: f.file?.size }))
    const imageSnapshot = attachedImages.slice()
    const imageAttachments = imageSnapshot.map(img => ({ name: img.name, dataUrl: img.dataUrl }))

    const userMsgId   = nextId()
    const assistantId = nextId()
    const userMsg = {
      id: userMsgId, role: 'user', content: trimmed,
      sources: [], streaming: false, attachments, imageAttachments,
    }
    const assistantMsg = {
      id: assistantId, role: 'assistant', content: '',
      sources: [], confidence: undefined, streaming: true, attachments: [],
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    setInput('')
    setAttachedFiles([])
    setAttachedImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // ── 2. Async setup (chat creation + file upload) ───────────────────────
    const immediateTitle = trimmed.slice(0, 60)
    let activeChatId = chatId
    if (!activeChatId) {
      try {
        const { data: newChat } = await createChat('New Chat')
        activeChatId = newChat.id
        // Set title immediately — sidebar shows it before the response arrives
        setChats(prev => [{ ...newChat, title: immediateTitle }, ...prev])
        skipReloadRef.current = true
        onChatCreated(newChat.id)
      } catch {
        setMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== assistantId))
        setStreaming(false)
        isSendingRef.current = false
        return
      }
    } else {
      // Existing chat still called 'New Chat' — rename immediately on first real message
      const existingTitle = chatsRef.current.find(c => c.id === activeChatId)?.title
      if (existingTitle === 'New Chat') {
        setChats(prev => prev.map(c =>
          c.id === activeChatId ? { ...c, title: immediateTitle } : c
        ))
        renameChat(activeChatId, immediateTitle).catch(() => {})
      }
    }

    let documentIds = []
    if (snapshot.length > 0) {
      const results = await Promise.allSettled(
        snapshot.map(({ file }) => uploadDocument(file, activeChatId, null))
      )
      documentIds = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.data.document_id)

      // If every upload failed, surface a clear error instead of silently
      // sending with no context and getting a "no documents" AI response.
      if (documentIds.length === 0) {
        const firstErr = results.find(r => r.status === 'rejected')?.reason
        const detail = firstErr?.response?.data?.detail || firstErr?.message || 'Upload failed'
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `⚠️ Could not upload the document: ${detail}. Please try again or upload it via the Documents page first.`, streaming: false }
            : m
        ))
        setStreaming(false)
        isSendingRef.current = false
        return
      }
    }

    // ── 3. Stream the response ─────────────────────────────────────────────
    const currentProvider = getProviderForModel(selectedModel)
    const userApiKey = connectedProviderKeys[currentProvider] || null
    aiResponseRef.current = ''  // reset accumulator for this new response

    try {
      await streamChat(
        { message: trimmed, conversationHistory, documentIds, chatId: activeChatId, model: selectedModel, userApiKey, language: i18n.language, images: imageSnapshot.map(img => img.dataUrl) },
        {
          onSources: sources =>
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m)),
          onToken: token => {
            aiResponseRef.current += token  // accumulate in ref (not state) so onDone can read it
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            ))
          },
          onDone: confidence => {
            const finalContent = aiResponseRef.current  // read accumulated response (bypasses React batching)
            aiResponseRef.current = ''
            setMessages(prev => prev.map(m => {
              if (m.id === assistantId) {
                if (m.content && !originalMsgsRef.current[m.id]) originalMsgsRef.current[m.id] = m.content
                return { ...m, confidence, streaming: false }
              }
              return m
            }))
            setStreaming(false)
            updateUser({ daily_usage: (user?.daily_usage || 0) + 1 })
            // Fetch follow-up suggestions and save memory (non-blocking)
            if (finalContent) {
              setSuggestions([])
              getSuggestions(trimmed, finalContent, i18n.language)
                .then(({ data }) => setSuggestions(data.suggestions || []))
                .catch(() => {})
            }
            // Save Q&A facts to long-term memory — now sends real AI response (not empty string)
            extractMemory(trimmed, finalContent).catch(() => {})
          },
          onError: err => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: `Error: ${err}`, streaming: false } : m
            ))
            setStreaming(false)
          },
        }
      )
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
          : m
      ))
      setStreaming(false)
    } finally {
      isSendingRef.current = false
    }
  }, [chatId, attachedFiles, attachedImages, conversationHistory, user, setChats, onChatCreated, updateUser, selectedModel, connectedProviderKeys])

  /* ── Regenerate ────────────────────────────────────────────────────────── */
  const regenerateMessage = useCallback(async (assistantMsgId, userQuery, history) => {
    if (isSendingRef.current) return
    isSendingRef.current = true

    setMessages(prev => prev.map(m =>
      m.id === assistantMsgId
        ? { ...m, content: '', sources: [], confidence: undefined, streaming: true }
        : m
    ))
    setStreaming(true)

    const currentProvider = getProviderForModel(selectedModel)
    const userApiKey = connectedProviderKeys[currentProvider] || null

    try {
      await streamChat(
        { message: userQuery, conversationHistory: history, documentIds: [], chatId, model: selectedModel, userApiKey, language: i18n.language },
        {
          onSources: sources =>
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, sources } : m)),
          onToken: token =>
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: m.content + token } : m
            )),
          onDone: confidence => {
            setMessages(prev => prev.map(m => {
              if (m.id === assistantMsgId) {
                // Regenerated content becomes the new original
                if (m.content) originalMsgsRef.current[m.id] = m.content
                return { ...m, confidence, streaming: false }
              }
              return m
            }))
            setStreaming(false)
          },
          onError: err => {
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: `Error: ${err}`, streaming: false } : m
            ))
            setStreaming(false)
          },
        }
      )
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
          : m
      ))
      setStreaming(false)
    } finally {
      isSendingRef.current = false
    }
  }, [chatId, selectedModel, connectedProviderKeys])

  const handleKeyDown         = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }
  const handleTextareaChange  = e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }
  const handleFileChange      = e => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const MAX_SIZE = 4 * 1024 * 1024
    const valid = files.filter(f => {
      if (f.size > MAX_SIZE) {
        alert(`"${f.name}" is too large. Maximum file size is 4 MB.`)
        return false
      }
      return true
    })
    setAttachedFiles(prev => [...prev, ...valid.slice(0, 3 - prev.length).map(f => ({ file: f, name: f.name }))].slice(0, 3))
    e.target.value = ''
  }
  const removeFile = name => setAttachedFiles(prev => prev.filter(f => f.name !== name))

  const compressImage = (file) => new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1024
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve({ name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.85) })
    }
    img.src = url
  })

  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const allowed = files.filter(f => f.type.startsWith('image/')).slice(0, 4 - attachedImages.length)
    const compressed = await Promise.all(allowed.map(compressImage))
    setAttachedImages(prev => [...prev, ...compressed].slice(0, 4))
    e.target.value = ''
  }

  const removeImage = (name) => setAttachedImages(prev => prev.filter(i => i.name !== name))

  const handleOpenModelPicker = () => setShowModelPicker(true)

  // Called when user clicks a locked model — remember which model they wanted
  const handleConnectProvider = (provider, modelId) => {
    setShowModelPicker(false)
    setConnectingProvider(provider)
    if (modelId) setPendingModel(modelId)
  }

  // Called after provider is successfully connected (key saved in ConnectProviderModal)
  const handleProviderConnected = (providerId, apiKey) => {
    setConnectedProviders(prev => [...new Set([...prev, providerId])])
    // Cache the actual key so it can be passed with chat requests immediately
    if (apiKey && apiKey !== 'platform') {
      setConnectedProviderKeys(prev => ({ ...prev, [providerId]: apiKey }))
    }
    if (pendingModel) {
      setSelectedModel(pendingModel)
      setPendingModel(null)
    }
  }
  const handleProviderDisconnected = (providerId) => {
    deleteProviderKey(providerId).catch(() => {})
    setConnectedProviders(prev => prev.filter(p => p !== providerId))
    // If current model belongs to disconnected provider, reset to default
    const providerMeta = PROVIDERS.find(p => p.id === providerId)
    if (providerMeta?.models.some(m => m.id === selectedModel)) {
      setSelectedModel('groq/llama-3.1-8b-instant')
    }
  }

  const SUGGESTIONS = [
    t('chat.suggestions.summarize'),
    t('chat.suggestions.findings'),
    t('chat.suggestions.explain'),
    t('chat.suggestions.list'),
  ]

  const exportChatAsPDF = () => {
    const title = chatsRef.current.find(c => c.id === chatId)?.title || 'Inkira Chat'
    const rows = messages
      .filter(m => !m.streaming && m.content)
      .map(m => {
        const role = m.role === 'user' ? 'You' : 'Inkira'
        const bg = m.role === 'user' ? '#fff7ed' : '#f8fafc'
        const border = m.role === 'user' ? '#fed7aa' : '#e2e8f0'
        return `<div style="margin-bottom:16px;padding:14px 16px;background:${bg};border:1px solid ${border};border-radius:12px;">
          <div style="font-size:11px;font-weight:600;color:${m.role === 'user' ? '#ea580c' : '#64748b'};margin-bottom:6px;">${role}</div>
          <div style="font-size:14px;color:#1e293b;white-space:pre-wrap;line-height:1.6;">${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>`
      })
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${title}</title>
      <style>body{font-family:-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 24px}
      @media print{body{margin:0 auto}}</style>
    </head><body>
      <div style="border-bottom:2px solid #f97316;padding-bottom:16px;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#f97316,#ea580c);border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <span style="color:white;font-size:16px;">✦</span>
          </div>
          <div>
            <div style="font-size:18px;font-weight:700;color:#1e293b;">${title}</div>
            <div style="font-size:12px;color:#94a3b8;">Exported from Inkira · ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>
      ${rows}
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const handleVoiceUserTranscript = text => {
    if (!text?.trim()) return
    setMessages(prev => [...prev, { id: nextId(), role: 'user',      content: text, sources: [], streaming: false, attachments: [] }])
  }
  const handleVoiceAssistantTranscript = text => {
    if (!text?.trim()) return
    setMessages(prev => [...prev, { id: nextId(), role: 'assistant', content: text, sources: [], streaming: false, attachments: [] }])
  }

  const barProps = { input, streaming, attachedFiles, removeFile, fileInputRef, handleFileChange, attachedImages, removeImage, imageInputRef, handleImageChange, handleTextareaChange, handleKeyDown, sendMessage, textareaRef, selectedModel, onOpenModelPicker: handleOpenModelPicker, t, language: i18n.language, onVoiceUserTranscript: handleVoiceUserTranscript, onVoiceAssistantTranscript: handleVoiceAssistantTranscript }

  /* ── Welcome screen ─────────────────────────────────────────────────────── */
  if (!chatId && messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 min-h-0 relative overflow-hidden">

        {/* Mobile header */}
        <div className="md:hidden shrink-0 flex items-center px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative z-10">
          <button
            onClick={onOpenSidebar}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* ── Drifting background orbs ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-orange-100 opacity-50 blur-3xl animate-orb-1" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-amber-100 opacity-40 blur-3xl animate-orb-2" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-orange-50 opacity-60 blur-2xl animate-orb-3" />
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center gap-5 sm:gap-8 px-4">

          {/* ── Animated icon ── */}
          <div className="anim-fade-up-0">
            <div className="relative mx-auto w-16 h-16">
              {/* Ping ring */}
              <span className="absolute inset-0 rounded-2xl bg-orange-400 opacity-25 animate-ping" style={{ animationDuration: '2.2s' }} />
              {/* Icon */}
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-200 animate-float-bob">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>

          {/* ── Greeting text ── */}
          <div className="text-center anim-fade-up-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{t('chat.greeting')}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 max-w-sm leading-relaxed">
              {t('chat.greetingSubtitle')}
            </p>
          </div>

          {/* ── Suggestion cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg px-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setInput(s); textareaRef.current?.focus() }}
                className={`text-left px-4 py-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-600 dark:text-zinc-400
                  hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50/70 dark:hover:bg-orange-950/30 hover:text-zinc-900 dark:hover:text-zinc-200 hover:-translate-y-0.5 hover:shadow-sm
                  transition-all duration-200 leading-snug anim-fade-up-${i + 2}`}
              >
                {s}
              </button>
            ))}
          </div>

        </div>
        <InputBar {...barProps} />
        {showModelPicker && (
          <ModelPickerModal
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            onClose={() => setShowModelPicker(false)}
            connectedProviders={connectedProviders}
            platformConfiguredProviders={platformProviders}
            onConnectProvider={handleConnectProvider}
            onDisconnect={handleProviderDisconnected}
          />
        )}
        {connectingProvider && (
          <ConnectProviderModal
            provider={connectingProvider}
            onClose={() => setConnectingProvider(null)}
            onConnected={handleProviderConnected}
            platformConfigured={platformProviders}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 min-h-0">
      {/* Mobile header */}
      <div className="md:hidden shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={onOpenSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          <Menu className="w-5 h-5" />
        </button>
        {messages.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowShare(true)}
              title="Share chat"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={exportChatAsPDF}
              title="Export chat as PDF"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {loadingChat ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
            <MessageSquare className="w-10 h-10 text-zinc-200 dark:text-zinc-700" />
            <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('chat.noMessages')}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full py-6">
            {/* Desktop export + share buttons — top-right of message area */}
            {messages.length > 0 && (
              <div className="hidden md:flex justify-end mb-2 px-4 gap-1">
                <button
                  onClick={() => setShowShare(true)}
                  title="Share chat"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                <button
                  onClick={exportChatAsPDF}
                  title="Export chat as PDF"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
              </div>
            )}

            {messages.map((msg, i) => {
              const isLastUser = msg.role === 'user' && i === messages.length - 2
              const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1 && !msg.streaming
              const regenHandler = msg.role === 'assistant' && !msg.streaming && messages[i - 1]?.role === 'user'
                ? () => {
                    const prevUserMsg = messages[i - 1]
                    const history = messages
                      .slice(0, i - 1)
                      .filter(m => !m.streaming)
                      .map(m => ({ role: m.role, content: m.content }))
                    regenerateMessage(msg.id, prevUserMsg.content, history)
                  }
                : null
              return (
                <div key={msg.id} ref={isLastUser ? lastUserMsgRef : null}>
                  <MessageBubble message={msg} onOpenDocuments={onOpenDocuments} onRegenerate={regenHandler} />
                  {/* Follow-up suggestion chips — only below the last assistant message */}
                  {isLastAssistant && suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 mb-1 pl-10">
                      {suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSuggestions([])
                            sendMessage(s)
                          }}
                          className="text-xs px-3 py-1.5 rounded-full border border-orange-200 bg-orange-50 text-orange-700
                            hover:bg-orange-100 hover:border-orange-300 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <InputBar {...barProps} />
      {showModelPicker && (
        <ModelPickerModal
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
          onClose={() => setShowModelPicker(false)}
          connectedProviders={connectedProviders}
          onConnectProvider={handleConnectProvider}
          onDisconnect={handleProviderDisconnected}
        />
      )}
      {connectingProvider && (
        <ConnectProviderModal
          provider={connectingProvider}
          onClose={() => setConnectingProvider(null)}
          onConnected={handleProviderConnected}
        />
      )}
      {showShare && chatId && (
        <ShareModal chatId={chatId} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}

/* ── InputBar ─────────────────────────────────────────────────────────────── */
function InputBar({ input, streaming, attachedFiles, removeFile, fileInputRef, handleFileChange, attachedImages, removeImage, imageInputRef, handleImageChange, handleTextareaChange, handleKeyDown, sendMessage, textareaRef, selectedModel, onOpenModelPicker, t, language, onVoiceUserTranscript, onVoiceAssistantTranscript }) {
  const modelMeta  = MODELS.find(m => m.id === selectedModel)
  const modelLabel = modelMeta?.name ?? selectedModel
  const visionWarning = attachedImages.length > 0 && modelMeta?.vision === false

  return (
    <div className="shrink-0 px-4 pb-5 pt-3 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
      <div className="max-w-3xl mx-auto">
        {visionWarning && (
          <div className="flex items-start gap-2.5 mb-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            <ImagePlus className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Image not supported by this model</p>
              <p className="mt-0.5 text-red-600">
                <strong>{modelLabel}</strong> cannot analyze images. Remove the image or switch to a{' '}
                <button
                  type="button"
                  onClick={onOpenModelPicker}
                  className="underline font-semibold hover:text-red-800 transition"
                >
                  Vision ✦ model
                </button>{' '}
                (GPT OSS 20B / 120B) to continue.
              </p>
            </div>
          </div>
        )}
        <div className={`relative bg-white dark:bg-zinc-800 border rounded-2xl shadow-sm transition-all ${streaming ? 'border-zinc-200 dark:border-zinc-700' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 focus-within:border-zinc-400 dark:focus-within:border-zinc-500 focus-within:shadow-md'}`}>

          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" multiple className="hidden" onChange={handleFileChange} />
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />

          {(attachedFiles.length > 0 || attachedImages.length > 0) && (
            <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
              {attachedFiles.map(({ name, file }) => (
                <AttachmentChip key={name} name={name} size={formatBytes(file?.size)} onRemove={() => removeFile(name)} />
              ))}
              {attachedImages.map(({ name, dataUrl }) => (
                <div key={name} className="relative group">
                  <img src={dataUrl} alt={name} className="w-16 h-16 object-cover rounded-xl border border-zinc-200" />
                  <button
                    onClick={() => removeImage(name)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-red-500 text-white transition"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={e => { if (visionWarning) return; handleKeyDown(e) }}
            placeholder={t('chat.placeholder')}
            disabled={streaming}
            rows={1}
            className="w-full resize-none bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none px-4 pt-3 pb-12 leading-relaxed disabled:cursor-not-allowed"
            style={{ maxHeight: '200px' }}
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 border-t border-zinc-100 dark:border-zinc-700">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming || attachedFiles.length >= 3}
                title={t('chat.attachTitle')}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={streaming || attachedImages.length >= 4}
                title="Attach image"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ImagePlus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onOpenModelPicker}
                disabled={streaming}
                title={t('chat.selectModel')}
                className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition disabled:opacity-30 disabled:cursor-not-allowed font-medium"
              >
                <span className="truncate max-w-[70px] sm:max-w-[120px]">{modelLabel}</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>

              <VoiceButton
                disabled={streaming}
                language={language}
                onUserTranscript={onVoiceUserTranscript}
                onAssistantTranscript={onVoiceAssistantTranscript}
              />

              {streaming && <span className="hidden sm:inline text-xs text-zinc-400">{t('chat.generating')}</span>}
            </div>

            <button
              onClick={() => sendMessage(input)}
              disabled={(!input.trim() && attachedFiles.length === 0 && attachedImages.length === 0) || streaming || visionWarning}
              className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-700 disabled:bg-zinc-200 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
            >
              {streaming
                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <ArrowUp className="w-4 h-4" />
              }
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-2">
          {t('chat.disclaimer')}
        </p>
      </div>
    </div>
  )
}

export { AttachmentChip, fileTypeStyle, formatBytes }
