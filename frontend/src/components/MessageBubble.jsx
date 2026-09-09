import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown, ChevronUp, FileText, Bot, RotateCcw, Copy, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'


/* ── File type helpers ────────────────────────────────────────────────────── */
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

/* File card in user message */
function FileCard({ attachment }) {
  const { bg, icon, border, label } = fileTypeStyle(attachment.name)
  const size = formatBytes(attachment.size)
  return (
    <div className={`flex items-center gap-2.5 ${bg} border ${border} rounded-xl px-3 py-2.5 w-fit max-w-[240px]`}>
      <div className={`shrink-0 ${icon}`}><FileText className="w-5 h-5" /></div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-zinc-800 truncate leading-tight">{attachment.name}</p>
        <p className="text-[11px] text-zinc-400 mt-0.5">{label}{size ? ` · ${size}` : ''}</p>
      </div>
    </div>
  )
}

/* ── Bot avatar — static or with spinning ring ────────────────────────────── */
function BotAvatar({ streaming }) {
  return (
    <div className="relative w-7 h-7 shrink-0 mt-0.5">
      {/* Spinning dashed ring while generating */}
      {streaming && (
        <div className="absolute -inset-[3px] rounded-full border-[2.5px] border-orange-200 border-t-orange-500 border-r-orange-400 animate-orbit" />
      )}
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center">
        <Bot className="w-4 h-4 text-white" />
      </div>
    </div>
  )
}

/* ── Typing indicator (three bouncing dots) ───────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

/* ── Source card (collapsible) ────────────────────────────────────────────── */
function SourceCard({ source, index }) {
  const [open, setOpen] = useState(false)
  const score = Math.round((source.similarity_score || 0) * 100)
  const badgeCls = score >= 75
    ? 'bg-green-50 text-green-700 border-green-200'
    : score >= 50
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-600 border-red-200'

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden text-xs bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="flex-1 font-medium text-gray-700 truncate">[{index}] {source.filename}</span>
        <span className="text-gray-400 shrink-0 text-[11px]">p.{source.page_number}</span>
        <span className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${badgeCls}`}>{score}%</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 py-2.5 text-gray-600 leading-relaxed border-t border-gray-100 bg-gray-50">
          {source.chunk_text}
        </div>
      )}
    </div>
  )
}

/* ── Confidence badge ─────────────────────────────────────────────────────── */
function ConfidenceTag({ value }) {
  const pct = Math.round((value || 0) * 100)
  const cls = pct >= 75 ? 'text-green-600 bg-green-50' : pct >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-500 bg-red-50'
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {pct >= 75 ? 'High' : pct >= 50 ? 'Medium' : 'Low'} confidence · {pct}%
    </span>
  )
}

function injectSourceLinks(content, sources) {
  let result = content

  // Pass 1: replace [filename] or [filename, Page N] for each known source
  for (const src of (sources || [])) {
    if (!src?.filename) continue
    const escaped = src.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\[${escaped}(?:[^\\]]*)\\]`, 'g')
    result = result.replace(re, `Source: [${src.filename}](doc://${src.document_id || 'docs'})`)
  }

  // Pass 2: any remaining [Source N] or [Source N: ...] → still make clickable
  result = result.replace(/\[Source (\d+)(?:[^\]]*)\]/g, (match, n) => {
    const src = sources?.[parseInt(n, 10) - 1]
    const label = src?.filename || `Document ${n}`
    const id = src?.document_id || 'docs'
    return `Source: [${label}](doc://${id})`
  })

  return result
}

/* ── MessageBubble ────────────────────────────────────────────────────────── */
export default function MessageBubble({ message, onOpenDocuments, onRegenerate }) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { user } = useAuth()
  const isUser      = message.role === 'user'
  const isStreaming = message.streaming
  const initial = (user?.name || user?.email || 'U').charAt(0).toUpperCase()

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  /* ── User message ── */
  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2 animate-fade-in">
        <div className="flex items-end gap-2.5 max-w-[82%]">
          <div className="flex flex-col items-end gap-2">
            {message.imageAttachments?.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                {message.imageAttachments.map((img, i) => (
                  <img
                    key={i}
                    src={img.dataUrl}
                    alt={img.name}
                    className="max-w-[220px] max-h-[180px] object-cover rounded-2xl border border-zinc-200 shadow-sm"
                  />
                ))}
              </div>
            )}
            {message.attachments?.length > 0 && (
              <div className="flex flex-col items-end gap-1.5">
                {message.attachments.map((att, i) => <FileCard key={i} attachment={att} />)}
              </div>
            )}
            {message.content && (
              <div className="bg-zinc-100 text-zinc-900 rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                {message.content}
              </div>
            )}
          </div>
          <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center shrink-0 mb-0.5">
            <span className="text-white text-xs font-semibold">{initial}</span>
          </div>
        </div>
      </div>
    )
  }

  /* ── Assistant message ── */
  return (
    <div className="flex gap-3 px-4 py-2 animate-fade-in">
      {/* Animated avatar */}
      <BotAvatar streaming={isStreaming} />

      <div className="flex-1 min-w-0 pb-1">

        {/* Content */}
        <div className="text-sm text-gray-800 leading-relaxed prose-chat">
          {isStreaming && !message.content ? (
            /* Waiting for first token */
            <div className="flex items-center gap-2 text-zinc-400 text-xs py-1">
              <TypingIndicator />
              <span>Inkira is thinking…</span>
            </div>
          ) : (
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    if (href?.startsWith('doc://')) {
                      return (
                        <button
                          onClick={() => onOpenDocuments?.()}
                          className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium underline underline-offset-2 decoration-orange-300 hover:decoration-orange-500 transition-colors"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          {children}
                        </button>
                      )
                    }
                    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                  }
                }}
              >
                {injectSourceLinks(message.content, message.sources)}
              </ReactMarkdown>
              {/* Blinking cursor while tokens are streaming */}
              {isStreaming && (
                <span
                  className="inline-block w-[2px] h-[1.1em] bg-zinc-400 rounded-full animate-cursor align-text-bottom ml-0.5"
                />
              )}
            </>
          )}
        </div>

        {/* Footer: confidence + sources toggle + actions — only after stream ends */}
        {!isStreaming && message.content && (() => {
          const cited = message.sources?.some(s => message.content.includes(s.filename))
          const showSources = cited && message.sources?.length > 0
          return (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                {message.confidence != null && <ConfidenceTag value={message.confidence} />}
                {showSources && (
                  <button
                    onClick={() => setSourcesOpen(v => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 font-medium transition-colors"
                  >
                    {sourcesOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {sourcesOpen ? 'Hide' : 'View'} {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  title="Copy response"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    title="Regenerate response"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {/* Sources list */}
        {sourcesOpen && message.sources?.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.sources.map((src, i) => <SourceCard key={i} source={src} index={i + 1} />)}
          </div>
        )}
      </div>
    </div>
  )
}
