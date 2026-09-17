import { useEffect, useRef, useState } from 'react'
import {
  Bot, Plus, Trash2, MessageSquare, LogOut, Pencil, Check, X,
  FolderOpen, Wand2, FolderPlus, ChevronRight, ChevronDown,
  Folder, Camera, Loader2, GitFork, Sun, Moon, Shield, Film,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  listChats, createChat, deleteChat, renameChat,
  listFolders, createFolder as apiCreateFolder,
  renameFolder as apiRenameFolder, deleteFolder as apiDeleteFolder,
  moveChatToFolder, updateAvatar as apiUpdateAvatar,
} from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import LanguagePicker from './LanguagePicker'

async function resizeImage(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width: w, height: h } = img
        if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize } }
        else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize } }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

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

/* ── ChatRow ──────────────────────────────────────────────────────────────── */
function ChatRow({ chat, isActive, onSelect, onDelete, onRename, onMoveToFolder, folders, deletingId, t }) {
  const [hovered,        setHovered]        = useState(false)
  const [editing,        setEditing]        = useState(false)
  const [draft,          setDraft]          = useState(chat.title)
  const [saving,         setSaving]         = useState(false)
  const [showFolderMenu, setShowFolderMenu] = useState(false)
  const inputRef = useRef(null)
  const menuRef  = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  useEffect(() => {
    if (!showFolderMenu) return
    const handler = e => { if (!menuRef.current?.contains(e.target)) setShowFolderMenu(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFolderMenu])

  const startEdit  = e => { e.stopPropagation(); setDraft(chat.title); setEditing(true) }
  const cancelEdit = e => { e?.stopPropagation(); setDraft(chat.title); setEditing(false) }
  const commitEdit = async e => {
    e?.stopPropagation()
    const trimmed = draft.trim()
    if (!trimmed || trimmed === chat.title) { setEditing(false); return }
    setSaving(true)
    try { await onRename(chat.id, trimmed) } finally { setSaving(false); setEditing(false) }
  }
  const handleKeyDown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(e) }
    if (e.key === 'Escape') cancelEdit(e)
  }

  return (
    <div className="relative">
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
            <button onMouseDown={commitEdit} disabled={saving}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-green-400 hover:text-green-300 hover:bg-zinc-700 transition">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onMouseDown={cancelEdit}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition">
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
                <button onClick={startEdit} title={t('sidebar.rename')}
                  className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {folders.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowFolderMenu(v => !v) }}
                    title="Move to folder"
                    className={`w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-700 transition ${
                      chat.folder_id ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={e => onDelete(e, chat.id)} disabled={deletingId === chat.id} title={t('sidebar.delete')}
                  className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Folder move dropdown */}
      {showFolderMenu && (
        <div ref={menuRef}
          className="absolute right-2 top-full mt-0.5 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[150px]">
          {chat.folder_id && (
            <>
              <button
                onClick={() => { onMoveToFolder(chat.id, null); setShowFolderMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 transition">
                <X className="w-3 h-3 shrink-0" /> Remove from folder
              </button>
              <div className="border-t border-zinc-700 my-1" />
            </>
          )}
          {folders.map(f => (
            <button key={f.id}
              onClick={() => { onMoveToFolder(chat.id, f.id); setShowFolderMenu(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 flex items-center gap-2 transition ${
                f.id === chat.folder_id ? 'text-orange-400' : 'text-zinc-300'
              }`}>
              <Folder className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              {f.id === chat.folder_id && <Check className="w-3 h-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── FolderSection ────────────────────────────────────────────────────────── */
function FolderSection({ folder, chats, activeId, onSelectChat, onDeleteChat, onRenameChat, onMoveChat, onDeleteFolder, onRenameFolder, allFolders, deletingId, t }) {
  const [open,        setOpen]        = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [draft,       setDraft]       = useState(folder.name)
  const [hovered,     setHovered]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (editingName) inputRef.current?.select() }, [editingName])

  const commitRename = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === folder.name) { setEditingName(false); return }
    setSaving(true)
    try { await onRenameFolder(folder.id, trimmed) } finally { setSaving(false); setEditingName(false) }
  }

  return (
    <div className="mb-1">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center px-2 py-1"
      >
        <button
          onClick={() => !editingName && setOpen(v => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          {open
            ? <ChevronDown  className="w-3 h-3 shrink-0 text-zinc-500" />
            : <ChevronRight className="w-3 h-3 shrink-0 text-zinc-500" />
          }
          <Folder className="w-3.5 h-3.5 shrink-0 text-orange-400" />
          {editingName ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                if (e.key === 'Escape') setEditingName(false)
              }}
              onBlur={commitRename}
              disabled={saving}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 bg-zinc-700 text-white text-xs rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
            />
          ) : (
            <>
              <span className="text-xs font-medium text-zinc-300 truncate flex-1">{folder.name}</span>
              <span className="text-[10px] text-zinc-600 shrink-0 ml-1">{chats.length}</span>
            </>
          )}
        </button>
        {hovered && !editingName && (
          <div className="flex items-center gap-0.5 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setDraft(folder.name); setEditingName(true) }}
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition">
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDeleteFolder(folder.id)}
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="ml-3">
          {chats.map(chat => (
            <ChatRow
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeId}
              onSelect={onSelectChat}
              onDelete={onDeleteChat}
              onRename={onRenameChat}
              onMoveToFolder={onMoveChat}
              folders={allFolders}
              deletingId={deletingId}
              t={t}
            />
          ))}
          {chats.length === 0 && (
            <p className="text-[10px] text-zinc-700 px-5 py-1 italic">Empty folder</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
export default function Sidebar({
  currentChatId, chats, setChats, onSelectChat, onNewChat,
  currentView, onSetView, isOpen, onClose,
}) {
  const { user, logout, updateUser } = useAuth()
  const { t } = useTranslation()
  const { dark, toggle: toggleTheme } = useTheme()
  const [deletingId,      setDeletingId]      = useState(null)
  const [creatingChat,    setCreatingChat]    = useState(false)
  const [folders,         setFolders]         = useState([])
  const [creatingFolder,  setCreatingFolder]  = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef(null)
  const newFolderRef   = useRef(null)

  const handleChatSelect = id => {
    onSelectChat(id)
    onClose?.()
  }

  useEffect(() => {
    listChats()
      .then(({ data }) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
        )
        setChats(sorted)
      })
      .catch(() => {})
    listFolders()
      .then(({ data }) => setFolders(data))
      .catch(() => {})
  }, [setChats])

  useEffect(() => {
    if (creatingFolder) newFolderRef.current?.focus()
  }, [creatingFolder])

  /* ── chat handlers ── */
  const handleNewChat = async () => {
    if (creatingChat) return
    setCreatingChat(true)
    try {
      const { data } = await createChat(t('sidebar.newChat'))
      setChats(prev => [data, ...prev])
      onNewChat(data.id)
      onSetView?.('chat')
      onClose?.()
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

  /* ── folder handlers ── */
  const folderSubmitting = useRef(false)
  const handleCreateFolder = async () => {
    if (folderSubmitting.current) return
    const name = newFolderName.trim()
    setCreatingFolder(false)
    setNewFolderName('')
    if (!name) return
    folderSubmitting.current = true
    const tempId = `temp_${Date.now()}`
    setFolders(prev => [...prev, { id: tempId, name, created_at: new Date().toISOString() }])
    try {
      const { data } = await apiCreateFolder(name)
      setFolders(prev => prev.map(f => f.id === tempId ? data : f))
    } catch {
      setFolders(prev => prev.filter(f => f.id !== tempId))
    } finally {
      folderSubmitting.current = false
    }
  }

  const handleRenameFolder = async (id, name) => {
    try {
      await apiRenameFolder(id, name)
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))
    } catch { }
  }

  const handleDeleteFolder = async (id) => {
    try {
      await apiDeleteFolder(id)
      setFolders(prev => prev.filter(f => f.id !== id))
      setChats(prev => prev.map(c => c.folder_id === id ? { ...c, folder_id: null } : c))
    } catch { }
  }

  const handleMoveChat = async (chatId, folderId) => {
    try {
      await moveChatToFolder(chatId, folderId)
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, folder_id: folderId } : c))
    } catch { }
  }

  /* ── avatar handler ── */
  const handleAvatarChange = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const dataUrl = await resizeImage(file, 200)
      updateUser({ avatar_url: dataUrl })   // show immediately
      apiUpdateAvatar(dataUrl).catch(() => {}) // save in background
    } catch (err) {
      console.error('Avatar resize failed:', err)
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  /* ── split chats into folders vs unfiled ── */
  const folderedMap = Object.fromEntries(folders.map(f => [f.id, []]))
  const unfiled = []
  for (const chat of chats) {
    if (chat.folder_id && folderedMap[chat.folder_id]) {
      folderedMap[chat.folder_id].push(chat)
    } else {
      unfiled.push(chat)
    }
  }
  const groups = groupChats(unfiled)
  const groupLabels = {
    Today:             t('sidebar.today'),
    Yesterday:         t('sidebar.yesterday'),
    'Previous 7 days': t('sidebar.previous7days'),
    Older:             t('sidebar.older'),
  }

  return (
    <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-zinc-950 flex flex-col h-full border-r border-zinc-800 flex-shrink-0 transition-transform duration-300 ease-in-out md:static md:z-auto md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Inkira</span>
        </div>
        <div className="flex items-center gap-1">
          {currentView === 'chat' && (
            <>
              <button
                onClick={() => setCreatingFolder(true)}
                title="New folder"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                onClick={handleNewChat}
                disabled={creatingChat}
                title={t('sidebar.newChat')}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex flex-col gap-1 px-2 py-2 border-b border-zinc-800">
        <button
          onClick={() => { onSetView?.('chat'); onClose?.() }}
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
          onClick={() => { onSetView?.('documents'); onClose?.() }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left ${
            currentView === 'documents'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          {t('sidebar.documents')}
        </button>
        <button
          onClick={() => { onSetView?.('image-edit'); onClose?.() }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left ${
            currentView === 'image-edit'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          {t('sidebar.imageGeneration')}
        </button>
        <button
          onClick={() => { onSetView?.('video-gen'); onClose?.() }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left ${
            currentView === 'video-gen'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <Film className="w-4 h-4" />
          {t('sidebar.videoGeneration')}
        </button>
        <button
          onClick={() => { onSetView?.('diagrams'); onClose?.() }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left ${
            currentView === 'diagrams'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
          }`}
        >
          <GitFork className="w-4 h-4 text-orange-400" />
          {t('sidebar.diagrams')}
        </button>
        {user?.role === 'admin' && (
          <a
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition w-full text-left text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <Shield className="w-4 h-4 text-orange-400" />
            Admin Panel
          </a>
        )}
      </div>

      {/* Middle section — always flex-1 so Language+User stay pinned at bottom */}
      <div className="flex-1 min-h-0 flex flex-col">

      {/* Chat list */}
      {currentView === 'chat' && (
        <div className="flex-1 overflow-y-auto py-2 sidebar-scroll">
          {/* New folder inline input */}
          {creatingFolder && (
            <div className="mx-2 mb-2 flex items-center gap-1.5 px-2 py-1">
              <Folder className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <input
                ref={newFolderRef}
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreateFolder() }
                  if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                }}
                onBlur={handleCreateFolder}
                placeholder="Folder name…"
                className="flex-1 min-w-0 bg-zinc-700 text-white text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-orange-500 placeholder-zinc-500"
              />
            </div>
          )}

          {chats.length === 0 && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-xs">{t('sidebar.noChats')}</p>
              <p className="text-zinc-600 text-xs mt-1">{t('sidebar.startConversation')}</p>
            </div>
          ) : (
            <>
              {/* Folders */}
              {folders.map(folder => (
                <FolderSection
                  key={folder.id}
                  folder={folder}
                  chats={folderedMap[folder.id] || []}
                  activeId={currentChatId}
                  onSelectChat={handleChatSelect}
                  onDeleteChat={handleDelete}
                  onRenameChat={handleRename}
                  onMoveChat={handleMoveChat}
                  onDeleteFolder={handleDeleteFolder}
                  onRenameFolder={handleRenameFolder}
                  allFolders={folders}
                  deletingId={deletingId}
                  t={t}
                />
              ))}

              {/* Unfiled chats */}
              {unfiled.length > 0 && (
                <>
                  {folders.length > 0 && (
                    <p className="px-4 py-1.5 text-[10px] font-medium text-zinc-600 uppercase tracking-wider">
                      Unfiled
                    </p>
                  )}
                  {Object.entries(groups).map(([label, items]) => {
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
                            onSelect={handleChatSelect}
                            onDelete={handleDelete}
                            onRename={handleRename}
                            onMoveToFolder={handleMoveChat}
                            folders={folders}
                            deletingId={deletingId}
                            t={t}
                          />
                        ))}
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Documents placeholder */}
      {currentView === 'documents' && (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-xs text-zinc-600 text-center leading-relaxed">
            {t('sidebar.switchToChats')}
          </p>
        </div>
      )}

      </div>{/* end middle flex-1 wrapper */}

      {/* Language + Theme */}
      <div className="px-2 pb-1 flex items-center gap-1">
        <div className="flex-1">
          <LanguagePicker />
        </div>
        <button
          onClick={toggleTheme}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* User section with clickable avatar */}
      {user && (
        <div className="border-t border-zinc-800 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div
              onClick={() => avatarInputRef.current?.click()}
              title="Change profile picture"
              className="relative w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0 cursor-pointer group"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="text-white text-xs font-semibold">
                  {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              )}
              {avatarUploading ? (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-3 h-3 text-white animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 rounded-full bg-black/50 hidden group-hover:flex items-center justify-center">
                  <Camera className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
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
