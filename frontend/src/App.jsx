import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AuthPage from './pages/AuthPage'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import DocumentsPage from './pages/DocumentsPage'
import { resetPassword } from './api/client'

/* ── Reset Password Modal ─────────────────────────────────────────────────── */
function ResetPasswordModal({ token, onClose }) {
  const { t } = useTranslation()
  const [passwords, setPasswords] = useState({ password: '', confirm: '' })
  const [showPass, setShowPass]   = useState(false)
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState('')
  const [done,     setDone]       = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    if (passwords.password.length < 8) {
      setError(t('resetPassword.errorLength'))
      return
    }
    if (passwords.password !== passwords.confirm) {
      setError(t('resetPassword.errorMatch'))
      return
    }
    setLoading(true)
    setError('')
    try {
      await resetPassword(token, passwords.password)
      setDone(true)
      // Clear token from URL
      window.history.replaceState({}, document.title, window.location.pathname)
      setTimeout(onClose, 2500)
    } catch (err) {
      setError(err.response?.data?.detail || t('resetPassword.error_generic'))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    window.history.replaceState({}, document.title, window.location.pathname)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {done ? (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">{t('resetPassword.successTitle')}</h2>
            <p className="text-sm text-zinc-500 mt-1">{t('resetPassword.successSubtitle')}</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-zinc-900 mb-1">{t('resetPassword.title')}</h2>
            <p className="text-sm text-zinc-500 mb-5">{t('resetPassword.subtitle')}</p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder={t('resetPassword.newPassword')}
                  value={passwords.password}
                  onChange={e => setPasswords(p => ({ ...p, password: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full pr-10 pl-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <input
                type={showPass ? 'text' : 'password'}
                placeholder={t('resetPassword.confirmPassword')}
                value={passwords.confirm}
                onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                required
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
              />

              {error && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('resetPassword.updating')}</>
                ) : (
                  t('resetPassword.update')
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

/* ── AppShell ─────────────────────────────────────────────────────────────── */
function AppShell() {
  const { user, loading } = useAuth()
  const { t } = useTranslation()
  const [currentChatId, setCurrentChatId] = useState(null)
  const [renderKey,     setRenderKey]     = useState('new')
  const [chats,         setChats]         = useState([])
  const [view,          setView]          = useState('chat')   // 'chat' | 'documents'
  const [resetToken,        setResetToken]        = useState(null)
  const [oauthConnected,    setOauthConnected]    = useState(null)   // e.g. 'google'
  const [oauthError,        setOauthError]        = useState(null)

  // Check for ?token= (password reset) and ?provider_connected= (Google OAuth) in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const connected = params.get('provider_connected')
    const providerError = params.get('provider_error')

    if (token) setResetToken(token)
    if (connected) {
      setOauthConnected(connected)
      window.history.replaceState({}, document.title, window.location.pathname)
      setTimeout(() => setOauthConnected(null), 3000)
    }
    if (providerError) {
      setOauthError(providerError)
      window.history.replaceState({}, document.title, window.location.pathname)
      setTimeout(() => setOauthError(null), 4000)
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <AuthPage />

  const selectChat = id => {
    setCurrentChatId(id)
    setRenderKey(id ?? 'new')
    setView('chat')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        currentChatId={currentChatId}
        chats={chats}
        setChats={setChats}
        onSelectChat={selectChat}
        onNewChat={selectChat}
        currentView={view}
        onSetView={setView}
      />

      {view === 'documents' ? (
        <DocumentsPage />
      ) : (
        <ChatWindow
          chatId={currentChatId}
          key={renderKey}
          onChatCreated={id => setCurrentChatId(id)}
          chats={chats}
          setChats={setChats}
          onOpenDocuments={() => setView('documents')}
          freshlyConnectedProvider={oauthConnected}
        />
      )}

      {resetToken && (
        <ResetPasswordModal
          token={resetToken}
          onClose={() => setResetToken(null)}
        />
      )}

      {/* Google OAuth success toast */}
      {oauthConnected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-zinc-900 text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-xl animate-fade-in">
          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          {oauthConnected.charAt(0).toUpperCase() + oauthConnected.slice(1)} {t('toast.connected')}
        </div>
      )}

      {/* Google OAuth error toast */}
      {oauthError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-red-600 text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-xl animate-fade-in">
          <span>⚠️</span>
          {t('toast.connectError', { provider: oauthError })}
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
