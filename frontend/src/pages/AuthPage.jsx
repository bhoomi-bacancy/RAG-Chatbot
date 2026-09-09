import { useState } from 'react'
import { Bot, Mail, Lock, User, Eye, EyeOff, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { login as apiLogin, register as apiRegister, forgotPassword } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function AuthPage() {
  const { login } = useAuth()
  const { t } = useTranslation()
  // mode: 'login' | 'register' | 'forgot' | 'forgot-sent'
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', name: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = field => e =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const switchMode = newMode => {
    setMode(newMode)
    setError('')
    setForm(prev => ({ ...prev, name: '', password: '' }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (mode === 'forgot') {
        await forgotPassword(form.email)
        setMode('forgot-sent')
        return
      }

      const { data } =
        mode === 'login'
          ? await apiLogin(form.email, form.password)
          : await apiRegister(form.email, form.name, form.password)
      login(data.access_token, data.user)
    } catch (err) {
      setError(
        err.response?.data?.detail || t('auth.error_generic')
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot-sent success screen ──────────────────────────────────────────────
  if (mode === 'forgot-sent') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">{t('auth.checkEmail')}</h1>
            <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
              {t('auth.resetSent')}<br />
              <span className="font-medium text-zinc-700">{form.email}</span>.<br />
              {t('auth.resetExpiry')}
            </p>
          </div>
          <p className="text-xs text-zinc-400 mb-4">{t('auth.noEmail')}</p>
          <button
            onClick={() => switchMode('login')}
            className="text-sm font-medium text-orange-500 hover:text-orange-600 transition flex items-center gap-1.5 mx-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('auth.backToSignIn')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mb-4">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">Inkira</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === 'login' && t('auth.subtitle_login')}
            {mode === 'register' && t('auth.subtitle_register')}
            {mode === 'forgot' && t('auth.subtitle_forgot')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name — register only */}
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder={t('auth.fullName')}
                value={form.name}
                onChange={set('name')}
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
              />
            </div>
          )}

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="email"
              placeholder={t('auth.emailAddress')}
              value={form.email}
              onChange={set('email')}
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
            />
          </div>

          {/* Password — login & register only */}
          {mode !== 'forgot' && (
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder={t('auth.password')}
                value={form.password}
                onChange={set('password')}
                required
                minLength={mode === 'register' ? 8 : undefined}
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Forgot password link — login mode only */}
          {mode === 'login' && (
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs text-zinc-400 hover:text-orange-500 transition"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-3 rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {mode === 'login' && t('auth.signingIn')}
                {mode === 'register' && t('auth.creatingAccount')}
                {mode === 'forgot' && t('auth.sendingReset')}
              </>
            ) : (
              <>
                {mode === 'login' && t('auth.continue')}
                {mode === 'register' && t('auth.createAccount')}
                {mode === 'forgot' && t('auth.sendResetLink')}
              </>
            )}
          </button>

          {/* Back link — forgot mode */}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-sm text-zinc-500 hover:text-zinc-700 transition flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('auth.backToSignIn')}
            </button>
          )}
        </form>

        {/* Mode toggle — login / register only */}
        {(mode === 'login' || mode === 'register') && (
          <p className="text-center text-sm text-zinc-500 mt-6">
            {mode === 'login' ? (
              <>
                {t('auth.noAccount')}{' '}
                <button
                  onClick={() => switchMode('register')}
                  className="font-semibold text-zinc-900 hover:text-orange-500 transition"
                >
                  {t('auth.signUp')}
                </button>
              </>
            ) : (
              <>
                {t('auth.haveAccount')}{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="font-semibold text-zinc-900 hover:text-orange-500 transition"
                >
                  {t('auth.signIn')}
                </button>
              </>
            )}
          </p>
        )}

        {/* Legal */}
        {(mode === 'login' || mode === 'register') && (
          <p className="text-center text-xs text-zinc-400 mt-6 leading-relaxed">
            {t('auth.terms')}{' '}
            <span className="underline cursor-pointer hover:text-zinc-600">{t('auth.termsLink')}</span>{' '}
            {t('auth.and')}{' '}
            <span className="underline cursor-pointer hover:text-zinc-600">{t('auth.privacyLink')}</span>.
          </p>
        )}
      </div>
    </div>
  )
}
