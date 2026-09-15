import { useState, useEffect, useCallback } from 'react'
import { Brain, Trash2, RefreshCw, PanelLeftOpen, AlertTriangle } from 'lucide-react'
import { getMemories, deleteMemory, clearMemories } from '../api/client'

export default function MemoryPage({ onOpenSidebar }) {
  const [memories, setMemories] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getMemories()
      .then(({ data }) => setMemories(data.memories || []))
      .catch(() => setMemories([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id) => {
    await deleteMemory(id)
    setMemories(prev => prev.filter(m => m.id !== id))
  }

  const clearAll = async () => {
    if (!window.confirm('Clear all memory? The AI will no longer remember any facts about you.')) return
    setClearing(true)
    await clearMemories().catch(() => {})
    setMemories([])
    setClearing(false)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <button
          onClick={onOpenSidebar}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Memory</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Facts the AI remembers about you across chats</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {memories.length > 0 && (
            <button
              onClick={clearAll}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="space-y-3 max-w-xl">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Brain className="w-7 h-7 text-zinc-400" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">No memories yet</p>
            <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-1 max-w-xs">
              When you share personal info in a chat (like your name or health conditions), the AI will remember it here for future chats.
            </p>
          </div>
        ) : (
          <div className="max-w-xl space-y-2">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
              {memories.length} {memories.length === 1 ? 'fact' : 'facts'} stored · injected into every new chat
            </p>
            {memories.map(m => (
              <div
                key={m.id}
                className="group flex items-start gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-violet-200 dark:hover:border-violet-700 transition"
              >
                <div className="w-2 h-2 rounded-full bg-violet-400 dark:bg-violet-500 mt-1.5 shrink-0" />
                <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-200 leading-snug">{m.memory}</p>
                <button
                  onClick={() => remove(m.id)}
                  title="Forget this"
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <div className="mt-6 flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                These facts are sent to the AI at the start of every chat. Remove any you don't want shared.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
