import { useEffect, useRef, useState } from 'react'
import { Send, Trash2, Stethoscope } from 'lucide-react'
import { streamChat } from '../api/client'
import MessageBubble from './MessageBubble'

let msgId = 0
const nextId = () => ++msgId

const EXAMPLE_QUESTIONS = [
  'What are the common symptoms of diabetes?',
  'Explain how vaccines stimulate the immune system.',
  'What are the side effects of ibuprofen?',
  'Describe the stages of hypertension.',
]

export default function ChatWindow({ selectedDocIds, hasDocuments }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const conversationHistory = messages
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: m.content }))

  const sendMessage = async text => {
    if (!text.trim() || streaming) return

    const userMsg = { id: nextId(), role: 'user', content: text.trim() }
    const assistantId = nextId()
    const assistantMsg = {
      id: assistantId,
      role: 'assistant',
      content: '',
      sources: [],
      confidence: undefined,
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    try {
      await streamChat(
        {
          message: text.trim(),
          conversationHistory,
          documentIds: selectedDocIds,
        },
        {
          onSources: sources => {
            setMessages(prev =>
              prev.map(m => (m.id === assistantId ? { ...m, sources } : m))
            )
          },
          onToken: token => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + token } : m
              )
            )
          },
          onDone: confidence => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, confidence, streaming: false } : m
              )
            )
            setStreaming(false)
          },
          onError: err => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${err}`, streaming: false }
                  : m
              )
            )
            setStreaming(false)
          },
        }
      )
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
            : m
        )
      )
      setStreaming(false)
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => setMessages([])

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shadow-sm">
        <div>
          <h2 className="font-semibold text-slate-800">Medical Assistant</h2>
          <p className="text-xs text-slate-500">
            {hasDocuments
              ? selectedDocIds.length > 0
                ? `Searching ${selectedDocIds.length} selected document${selectedDocIds.length > 1 ? 's' : ''}`
                : 'Searching all documents'
              : 'Upload documents to begin'}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-500 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-medical-100 flex items-center justify-center">
              <Stethoscope className="w-8 h-8 text-medical-500" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 text-lg">How can I help you today?</h3>
              <p className="text-slate-500 text-sm mt-1 max-w-sm">
                Ask any medical question based on your uploaded documents.
              </p>
            </div>
            {hasDocuments && (
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {EXAMPLE_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="text-left text-sm text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2.5 hover:border-medical-300 hover:bg-medical-50 hover:text-medical-700 transition-all leading-snug"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 bg-white border-t border-slate-200">
        <div className={`flex gap-3 items-end bg-slate-50 border rounded-2xl px-4 py-3 transition-colors
          ${streaming ? 'border-slate-200 opacity-80' : 'border-slate-200 focus-within:border-medical-400 focus-within:bg-white'}`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasDocuments ? 'Ask a medical question…' : 'Upload a document first…'}
            disabled={streaming || !hasDocuments}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none max-h-36 disabled:cursor-not-allowed"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming || !hasDocuments}
            className="shrink-0 w-9 h-9 rounded-xl bg-medical-500 hover:bg-medical-600 disabled:bg-slate-300 text-white flex items-center justify-center transition-colors mb-0.5"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">
          MedAssist provides information only — always consult a licensed healthcare professional.
        </p>
      </div>
    </div>
  )
}
