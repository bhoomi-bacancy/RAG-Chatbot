import { useEffect, useRef, useState } from 'react'
import { Bot, Plus, Trash2, MessageSquare, LogOut, Pencil, Check, X, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listChats, createChat, deleteChat, renameChat } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import LanguagePicker from './LanguagePicker'

function timeAgo(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupChats(chats) {
  const now = new Date()
  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOf7DaysAgo  = new Date(startOfToday.getTime() - 6 * 86400000)
  const groups = { Today: [], Yesterday: [], 'Previous 7 days': [], Older: [] }
  for (const chat of chats) {
    const d = new Date(chat.updated_at || chat.created_at)
    if (d >= startOfToday)           groups.Today.push(chat)
    else if (d >= startOfYesterday)  groups.Yesterday.push(chat)
    else if (d >= startOf7DaysAgo)   groups['Previous 7 days'].push(chat)
    else                             groups.Older.push(chat)
  }
  return groups
}

/* ── Inline-editable chat row ─────────────────────────────────────────────── */
function ChatRow({ chat, isActive, onSelect, onDelete, onRename, deletingId, t }) {
  const [hovered,  setHovered]  = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(chat.title)
  const [saving,   setSaving]   = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const startEdit = e => {
    e.stopPropagation()
    setDraft(chat.title)
    setEditing(true)
  }

  const cancelEdit = e => {
    e?.stopPropagation()
    setDraft(chat.title)
    setEditing(false)
  }

  const commitEdit = async e => {
    e?.stopPropagation()
    const trimmed = draft.trim()
    if (!trimmed || trimmed === chat.title) { setEditing(false); return }
    setSaving(true)
    try {
      await onRename(chat.id, trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(e) }
    if (e.key === 'Escape') cancelEdit(e)
  }

  return (
    <div
      onClick={() => !editing && onSelect(chat.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex items-center mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            disabled={saving}
            className="flex-1 min-w-0 bg-zinc-700 text-white text-sm rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
          />
          <button
            onMouseDown={commitEdit}
            disabled={saving}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-green-400 hover:text-green-300 hover:bg-zinc-700 transition"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onMouseDown={cancelEdit}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0 mr-1.5">
            <p className="text-sm font-medium truncate">{chat.title}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{timeAgo(chat.updated_at || chat.created_at)}</p>
          </div>
          {(hovered || isActive) && (
            <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
              <button
                onClick={startEdit}
                title={t('sidebar.rename')}
                className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={e => onDelete(e, chat.id)}
                disabled={deletingId === chat.id}
                title={t('sidebar.delete')}
                className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
export default function Sidebar({
  currentChatId, chats, setChats, onSelectChat, onNewChat,
  currentView, onSetView,
}) {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const [deletingId,   setDeletingId]   = useState(null)
  const [creatingChat, setCreatingChat] = useState(false)

  useEffect(() => {
    listChats()
      .then(({ data }) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        )
        setChats(sorted)
      })
      .catch(() => {})
  }, [setChats])

  const handleNewChat = async () => {
    if (creatingChat) return
    setCreatingChat(true)
    try {
      const { data } = await createChat(t('sidebar.newChat'))
      setChats(prev => [data, ...prev])
      onNewChat(data.id)
      onSetView?.('chat')
    } catch { } finally { setCreatingChat(false) }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    setDeletingId(id)
    try {
      await deleteChat(id)
      setChats(prev => prev.filter(c => c.id !== id))
      if (currentChatId === id) onSelectChat(null)
    } catch { } finally { setDeletingId(null) }
  }

  const handleRename = async (id, title) => {
    await renameChat(id, title)
    setChats(prev => prev.map(c => c.id === id ? { ...c, title } : c))
  }

  const groupLabels = {
    Today: t('sidebar.today'),
    Yesterday: t('sidebar.yesterday'),
    'Previous 7 days': t('sidebar.previous7days'),
    Older: t('sidebar.older'),
  }

  const groups = groupChats(chats)

  return (
    <div className="w-64 bg-zinc-950 flex flex-col h-full border-r border-zinc-800 flex-shrink-0">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Inkira</span>
        </div>
        {currentView === 'chat' && (
          <button
            onClick={handleNewChat}
            disabled={creatingChat}
            title={t('sidebar.newChat')}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav tabs */}
      <div className="flex flex-col gap-1 px-2 py-2 border-b border-zinc-800">
        <button
          onClick={() => onSetView?.('chat')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left ${
            currentView === 'chat'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {t('sidebar.chats')}
        </button>
        <button
          onClick={() => onSetView?.('documents')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left ${
            currentView === 'documents'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          {t('sidebar.documents')}
        </button>
      </div>

      {/* Chat list — shown only when in chat view */}
      {currentView === 'chat' && (
        <div className="flex-1 overflow-y-auto py-2">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-xs">{t('sidebar.noChats')}</p>
              <p className="text-zinc-600 text-xs mt-1">{t('sidebar.startConversation')}</p>
            </div>
          ) : (
            Object.entries(groups).map(([label, items]) => {
              if (!items.length) return null
              return (
                <div key={label} className="mb-2">
                  <p className="px-4 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {groupLabels[label] || label}
                  </p>
                  {items.map(chat => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === currentChatId}
                      onSelect={onSelectChat}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      deletingId={deletingId}
                      t={t}
                    />
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Documents placeholder when in documents view */}
      {currentView === 'documents' && (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-zinc-600 text-center leading-relaxed">
            {t('sidebar.switchToChats')}
          </p>
        </div>
      )}

      {/* Language picker */}
      <div className="px-2 pb-1">
        <LanguagePicker />
      </div>

      {/* User section */}
      {user && (
        <div className="border-t border-zinc-800 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-300 truncate">{user.name || 'User'}</p>
              <p className="text-xs text-zinc-600 truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              title={t('sidebar.signOut')}
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
