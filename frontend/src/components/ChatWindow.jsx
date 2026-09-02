import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUp, Paperclip, X, Loader2, Sparkles, MessageSquare, FileText } from 'lucide-react'
import { streamChat, getChat, createChat, uploadDocument } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import MessageBubble from './MessageBubble'

let msgId = 0
const nextId = () => ++msgId

const SUGGESTIONS = [
  'Summarize the uploaded document',
  'What are the key findings?',
  'Explain the main concepts',
  'List the important points',
]

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

export default function ChatWindow({ chatId, onChatCreated, chats, setChats }) {
  const { user, updateUser } = useAuth()
  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [streaming, setStreaming]         = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [loadingChat, setLoadingChat]     = useState(false)

  const scrollRef     = useRef(null)
  const textareaRef   = useRef(null)
  const fileInputRef  = useRef(null)
  const skipReloadRef = useRef(false)

  /* ── Load chat history ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!chatId) { setMessages([]); return }
    if (skipReloadRef.current) { skipReloadRef.current = false; return }
    setLoadingChat(true)
    getChat(chatId)
      .then(({ data }) =>
        setMessages(
          (data.messages || []).map(m => ({
            id: nextId(), role: m.role, content: m.content,
            sources: [], confidence: undefined, streaming: false,
            attachments: m.attachments || [],
          }))
        )
      )
      .catch(() => setMessages([]))
      .finally(() => setLoadingChat(false))
  }, [chatId])

  /* ── Auto-scroll ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [messages])

  const conversationHistory = messages
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: m.content }))

  /* ── Send message ───────────────────────────────────────────────────────── */
  const sendMessage = useCallback(async text => {
    if (!text.trim() || streaming) return

    let activeChatId = chatId
    if (!activeChatId) {
      try {
        const { data: newChat } = await createChat('New Chat')
        activeChatId = newChat.id
        setChats(prev => [newChat, ...prev])
        skipReloadRef.current = true
        onChatCreated(newChat.id)
      } catch { return }
    }

    // Upload attachments first
    const snapshot = attachedFiles.slice()
    setAttachedFiles([])
    let documentIds = []
    if (snapshot.length > 0) {
      const results = await Promise.allSettled(
        snapshot.map(({ file }) => uploadDocument(file, activeChatId, null))
      )
      documentIds = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.data.document_id)
    }

    const attachments = snapshot.map(f => ({ name: f.name, size: f.file?.size }))
    const userMsg = {
      id: nextId(), role: 'user', content: text.trim(),
      sources: [], streaming: false, attachments,
    }
    const assistantId = nextId()
    const assistantMsg = {
      id: assistantId, role: 'assistant', content: '',
      sources: [], confidence: undefined, streaming: true, attachments: [],
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      await streamChat(
        { message: text.trim(), conversationHistory, documentIds, chatId: activeChatId },
        {
          onSources: sources =>
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources } : m)),
          onToken: token =>
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + token } : m
            )),
          onDone: confidence => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, confidence, streaming: false } : m
            ))
            setStreaming(false)
            updateUser({ daily_usage: (user?.daily_usage || 0) + 1 })
            setChats(prev => prev.map(c =>
              c.id === activeChatId && c.title === 'New Chat'
                ? { ...c, title: text.trim().slice(0, 60) }
                : c
            ))
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
    }
  }, [chatId, streaming, attachedFiles, conversationHistory, user, setChats, onChatCreated, updateUser])

  const handleKeyDown         = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }
  const handleTextareaChange  = e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }
  const handleFileChange      = e => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setAttachedFiles(prev => [...prev, ...files.slice(0, 3 - prev.length).map(f => ({ file: f, name: f.name }))].slice(0, 3))
    e.target.value = ''
  }
  const removeFile = name => setAttachedFiles(prev => prev.filter(f => f.name !== name))

  const barProps = { input, streaming, attachedFiles, removeFile, fileInputRef, handleFileChange, handleTextareaChange, handleKeyDown, sendMessage, textareaRef }

  /* ── Welcome screen ─────────────────────────────────────────────────────── */
  if (!chatId && messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-white min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900">How can I help you?</h1>
            <p className="text-sm text-zinc-500 mt-2 max-w-sm">
              Start a conversation or try a suggestion below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setInput(s); textareaRef.current?.focus() }}
                className="text-left px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 transition-all leading-snug"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <InputBar {...barProps} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {loadingChat ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
            <MessageSquare className="w-10 h-10 text-zinc-200" />
            <p className="text-sm text-zinc-400">No messages yet — send one to get started.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full py-6">
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
          </div>
        )}
      </div>
      <InputBar {...barProps} />
    </div>
  )
}

/* ── InputBar ─────────────────────────────────────────────────────────────── */
function InputBar({ input, streaming, attachedFiles, removeFile, fileInputRef, handleFileChange, handleTextareaChange, handleKeyDown, sendMessage, textareaRef }) {
  return (
    <div className="shrink-0 px-4 pb-5 pt-3 bg-white border-t border-zinc-100">
      <div className="max-w-3xl mx-auto">
        <div className={`relative bg-white border rounded-2xl shadow-sm transition-all ${streaming ? 'border-zinc-200' : 'border-zinc-200 hover:border-zinc-300 focus-within:border-zinc-400 focus-within:shadow-md'}`}>

          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" multiple className="hidden" onChange={handleFileChange} />

          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
              {attachedFiles.map(({ name, file }) => (
                <AttachmentChip key={name} name={name} size={formatBytes(file?.size)} onRemove={() => removeFile(name)} />
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Inkira…"
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
                title="Attach PDF, DOCX, or TXT (max 3)"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {streaming && <span className="text-xs text-zinc-400">Generating…</span>}
            </div>

            <button
              onClick={() => sendMessage(input)}
              disabled={(!input.trim() && attachedFiles.length === 0) || streaming}
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
          Inkira can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}

export { AttachmentChip, fileTypeStyle, formatBytes }
