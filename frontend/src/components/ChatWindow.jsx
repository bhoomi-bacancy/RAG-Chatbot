import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUp, Paperclip, X, Loader2, Sparkles, MessageSquare, FileText, ChevronDown, ImagePlus, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { streamChat, getChat, createChat, uploadDocument, renameChat, getConfiguredProviders, getMyProviderKeys, deleteProviderKey, translateMessages } from '../api/client'
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

export default function ChatWindow({ chatId, onChatCreated, chats, setChats, onOpenDocuments, freshlyConnectedProvider, onOpenSidebar }) {
  const { user, updateUser } = useAuth()
  const { t } = useTranslation()
  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [loadingChat, setLoadingChat]     = useState(false)
  const [selectedModel, setSelectedModel] = useState('groq/compound-mini')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [connectedProviders, setConnectedProviders] = useState([])
  const [connectedProviderKeys, setConnectedProviderKeys] = useState({})
  const [connectingProvider, setConnectingProvider] = useState(null)
  const [pendingModel, setPendingModel] = useState(null)  // model user tried to select before connecting
  const [platformProviders, setPlatformProviders] = useState(['groq'])

  const [attachedImages, setAttachedImages] = useState([])

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
    if (!text.trim() || isSendingRef.current) return
    isSendingRef.current = true

    // ── 1. Instant UI feedback — clear input and show spinner immediately ──
    const trimmed = text.trim()
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
    }

    // ── 3. Stream the response ─────────────────────────────────────────────
    const currentProvider = getProviderForModel(selectedModel)
    const userApiKey = connectedProviderKeys[currentProvider] || null

    try {
      await streamChat(
        { message: trimmed, conversationHistory, documentIds, chatId: activeChatId, model: selectedModel, userApiKey, language: i18n.language, images: imageSnapshot.map(img => img.dataUrl) },
        {
          onSources: sources =>
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m)),
          onToken: token =>
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )),
          onDone: confidence => {
            setMessages(prev => prev.map(m => {
              if (m.id === assistantId) {
                if (m.content && !originalMsgsRef.current[m.id]) originalMsgsRef.current[m.id] = m.content
                return { ...m, confidence, streaming: false }
              }
              return m
            }))
            setStreaming(false)
            updateUser({ daily_usage: (user?.daily_usage || 0) + 1 })
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
      setSelectedModel('groq/compound-mini')
    }
  }

  const SUGGESTIONS = [
    t('chat.suggestions.summarize'),
    t('chat.suggestions.findings'),
    t('chat.suggestions.explain'),
    t('chat.suggestions.list'),
  ]

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
      <div className="flex-1 flex flex-col bg-white min-h-0 relative overflow-hidden">

        {/* Mobile header */}
        <div className="md:hidden shrink-0 flex items-center px-4 py-3 border-b border-zinc-100 bg-white relative z-10">
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
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">{t('chat.greeting')}</h1>
            <p className="text-sm text-zinc-500 mt-2 max-w-sm leading-relaxed">
              {t('chat.greetingSubtitle')}
            </p>
          </div>

          {/* ── Suggestion cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg px-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setInput(s); textareaRef.current?.focus() }}
                className={`text-left px-4 py-3.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600
                  hover:border-orange-300 hover:bg-orange-50/70 hover:text-zinc-900 hover:-translate-y-0.5 hover:shadow-sm
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
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {/* Mobile header */}
      <div className="md:hidden shrink-0 flex items-center px-4 py-3 border-b border-zinc-100 bg-white">
        <button
          onClick={onOpenSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 transition"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {loadingChat ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
            <MessageSquare className="w-10 h-10 text-zinc-200" />
            <p className="text-sm text-zinc-400">{t('chat.noMessages')}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full py-6">
            {messages.map((msg, i) => {
              const isLastUser = msg.role === 'user' && i === messages.length - 2
              // Build history up to (not including) the user msg before this assistant msg
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
    </div>
  )
}

/* ── InputBar ─────────────────────────────────────────────────────────────── */
function InputBar({ input, streaming, attachedFiles, removeFile, fileInputRef, handleFileChange, attachedImages, removeImage, imageInputRef, handleImageChange, handleTextareaChange, handleKeyDown, sendMessage, textareaRef, selectedModel, onOpenModelPicker, t, language, onVoiceUserTranscript, onVoiceAssistantTranscript }) {
  const modelMeta  = MODELS.find(m => m.id === selectedModel)
  const modelLabel = modelMeta?.name ?? selectedModel
  const visionWarning = attachedImages.length > 0 && modelMeta?.vision === false

  return (
    <div className="shrink-0 px-4 pb-5 pt-3 bg-white border-t border-zinc-100">
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
        <div className={`relative bg-white border rounded-2xl shadow-sm transition-all ${streaming ? 'border-zinc-200' : 'border-zinc-200 hover:border-zinc-300 focus-within:border-zinc-400 focus-within:shadow-md'}`}>

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
            className="w-full resize-none bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none px-4 pt-3 pb-12 leading-relaxed disabled:cursor-not-allowed"
            style={{ maxHeight: '200px' }}
          />

          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2 border-t border-zinc-100">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming || attachedFiles.length >= 3}
                title={t('chat.attachTitle')}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={streaming || attachedImages.length >= 4}
                title="Attach image"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ImagePlus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onOpenModelPicker}
                disabled={streaming}
                title={t('chat.selectModel')}
                className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed font-medium"
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

        <p className="text-center text-xs text-zinc-400 mt-2">
          {t('chat.disclaimer')}
        </p>
      </div>
    </div>
  )
}

export { AttachmentChip, fileTypeStyle, formatBytes }
