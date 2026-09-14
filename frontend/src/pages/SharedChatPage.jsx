import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Loader2, AlertCircle } from 'lucide-react'
import { getSharedChat } from '../api/client'

export default function SharedChatPage({ token }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    getSharedChat(token)
      .then(d => setData(d))
      .catch(() => setError('This shared chat could not be found or the link has expired.'))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-zinc-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-zinc-900">Inkira</span>
          <span className="text-xs text-zinc-400 hidden sm:inline">· Shared conversation</span>
        </div>
        <a
          href="/"
          className="text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition"
        >
          Open Inkira
        </a>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <AlertCircle className="w-10 h-10 text-zinc-300" />
            <p className="text-sm text-zinc-500">{error}</p>
            <a href="/" className="text-sm text-orange-500 hover:underline">Go to Inkira</a>
          </div>
        )}

        {data && (
          <>
            <h1 className="text-xl font-semibold text-zinc-900 mb-6">{data.title}</h1>
            <div className="flex flex-col gap-4">
              {data.messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-zinc-100 text-zinc-900 rounded-br-sm'
                      : 'text-zinc-800 prose-chat'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="bg-white border-t border-zinc-100 px-4 py-6 text-center">
        <p className="text-sm text-zinc-500 mb-3">
          Want to ask your own medical questions? Try Inkira — upload any document, ask anything.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
        >
          Try Inkira free
        </a>
      </footer>
    </div>
  )
}
