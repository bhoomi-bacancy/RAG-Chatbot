import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ChevronDown, ChevronUp, FileText, Activity, User } from 'lucide-react'

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 75 ? 'bg-emerald-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
  const label = pct >= 75 ? 'High confidence' : pct >= 50 ? 'Medium confidence' : 'Low confidence'
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 bg-slate-200 rounded-full h-1">
        <div className={`${color} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 whitespace-nowrap">{label} · {pct}%</span>
    </div>
  )
}

function SourceCard({ source, index }) {
  const [expanded, setExpanded] = useState(false)
  const score = Math.round(source.similarity_score * 100)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <FileText className="w-3.5 h-3.5 text-medical-500 shrink-0" />
        <span className="flex-1 font-medium text-slate-700 truncate">
          [{index}] {source.filename}
        </span>
        <span className="text-slate-500 shrink-0">p.{source.page_number}</span>
        <span className={`shrink-0 font-semibold ${score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
          {score}%
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-white border-t border-slate-100 text-slate-600 leading-relaxed">
          {source.chunk_text}
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-1 py-0.5">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const [sourcesOpen, setSourcesOpen] = useState(false)

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="flex items-end gap-2 max-w-[80%]">
          <div className="bg-medical-500 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
            {message.content}
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center shrink-0 mb-0.5">
            <User className="w-4 h-4 text-slate-600" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="flex items-end gap-2 max-w-[85%]">
        <div className="w-7 h-7 rounded-full bg-medical-500 flex items-center justify-center shrink-0 mb-0.5">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-slate-100">
            {message.streaming && !message.content ? (
              <TypingIndicator />
            ) : (
              <div className="text-sm text-slate-700 prose-medical">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}

            {!message.streaming && message.confidence !== undefined && message.content && (
              <ConfidenceBar value={message.confidence} />
            )}
          </div>

          {message.sources?.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setSourcesOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs text-medical-600 hover:text-medical-700 font-medium transition-colors mb-1.5"
              >
                {sourcesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {sourcesOpen ? 'Hide' : 'Show'} {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
              </button>
              {sourcesOpen && (
                <div className="space-y-1.5">
                  {message.sources.map((src, i) => (
                    <SourceCard key={i} source={src} index={i + 1} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
