import { useState } from 'react'
import { Bot, Mail, Lock, User, Eye, EyeOff, Loader2, CheckCircle, ArrowLeft, FileText, Globe, Shield, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGoogleLogin } from '@react-oauth/google'
import { useLinkedIn } from 'react-linkedin-login-oauth2'
import FacebookLogin from '@greatsumini/react-facebook-login'
import {
  login as apiLogin, register as apiRegister, forgotPassword,
  googleAuth, facebookAuth, instagramAuth, linkedinAuth,
} from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const GOOGLE_CLIENT_ID   = import.meta.env.VITE_GOOGLE_CLIENT_ID   || ''
const FACEBOOK_APP_ID    = import.meta.env.VITE_FACEBOOK_APP_ID    || ''
const LINKEDIN_CLIENT_ID = import.meta.env.VITE_LINKEDIN_CLIENT_ID || ''
const LINKEDIN_REDIRECT  = `${window.location.origin}/linkedin`

/* ── Social icons ─────────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0" fill="#0A66C2">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433"/>
          <stop offset="25%" stopColor="#e6683c"/>
          <stop offset="50%" stopColor="#dc2743"/>
          <stop offset="75%" stopColor="#cc2366"/>
          <stop offset="100%" stopColor="#bc1888"/>
        </linearGradient>
      </defs>
      <path fill="url(#ig-grad)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  )
}

/* ── Social button shell ──────────────────────────────────────────────────── */
function SocialBtn({ loading, disabled, onClick, icon, label }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-2 py-2.5 border border-zinc-200 rounded-xl bg-white hover:bg-zinc-50 hover:border-zinc-300 active:bg-zinc-100 disabled:opacity-50 transition text-sm font-medium text-zinc-700 w-full shadow-sm"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : icon}
      {label}
    </button>
  )
}

function GoogleBtn({ loading, disabled, onToken, onStart, onError }) {
  const trigger = useGoogleLogin({
    onSuccess: res => onToken(res.access_token),
    onError,
  })
  return (
    <SocialBtn loading={loading} disabled={disabled}
      onClick={() => { onStart(); trigger() }}
      icon={<GoogleIcon />} label="Google" />
  )
}

function LinkedInBtn({ loading, disabled, onCode, onStart, onError }) {
  const { linkedInLogin } = useLinkedIn({
    clientId: LINKEDIN_CLIENT_ID,
    redirectUri: LINKEDIN_REDIRECT,
    scope: 'openid profile email',
    onSuccess: code => onCode(code),
    onError: () => onError(),
  })
  return (
    <SocialBtn loading={loading} disabled={disabled}
      onClick={() => { onStart(); linkedInLogin() }}
      icon={<LinkedInIcon />} label="LinkedIn" />
  )
}

/* ── Brand panel feature list ─────────────────────────────────────────────── */
const FEATURES = [
  { icon: FileText,  text: 'Analyze documents with AI' },
  { icon: Globe,     text: 'Multilingual — 6 languages supported' },
  { icon: Shield,    text: 'Secure & private by design' },
  { icon: Sparkles,  text: 'AI-powered answers with citations' },
]

/* ── AuthPage ─────────────────────────────────────────────────────────────── */
export default function AuthPage() {
  const { login } = useAuth()
  const { t } = useTranslation()
  const [mode, setMode]         = useState('login')
  const [form, setForm]         = useState({ email: '', name: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [ssoLoading, setSso]    = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const set = field => e => setForm(p => ({ ...p, [field]: e.target.value }))
  const switchMode = m => { setMode(m); setError(''); setSuccess(''); setForm(p => ({ ...p, name: '', password: '' })) }

  const validate = () => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const email = form.email.trim()
    if (!email) return 'Email address is required.'
    if (!emailRe.test(email)) return 'Please enter a valid email address.'
    if (mode === 'register') {
      if (!form.name.trim()) return 'Full name is required.'
      if (form.name.trim().length < 2) return 'Name must be at least 2 characters.'
      if (!form.password) return 'Password is required.'
      if (form.password.length < 8) return 'Password must be at least 8 characters.'
    }
    if (mode === 'login' && !form.password) return 'Password is required.'
    return null
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setLoading(true); setError('')
    try {
      if (mode === 'forgot') { await forgotPassword(form.email.trim()); setMode('forgot-sent'); return }
      if (mode === 'register') {
        await apiRegister(form.email.trim(), form.name.trim(), form.password)
        switchMode('login')
        setSuccess('Account created! Please sign in.')
        return
      }
      const { data } = await apiLogin(form.email.trim(), form.password)
      login(data.access_token, data.user)
    } catch (err) {
      setError(err.response?.data?.detail || t('auth.error_generic'))
    } finally { setLoading(false) }
  }

  const ssoLogin = async (apiFn, provider) => {
    setError('')
    try {
      const { data } = await apiFn
      login(data.access_token, data.user)
    } catch (err) {
      setError(err.response?.data?.detail || `${provider} sign-in failed. Please try again.`)
    } finally { setSso('') }
  }

  const handleGoogleToken    = tk => ssoLogin(googleAuth(tk),   'Google')
  const handleFacebookToken  = tk => ssoLogin(facebookAuth(tk), 'Facebook')
  const handleInstagramToken = tk => ssoLogin(instagramAuth(tk),'Instagram')
  const handleLinkedInCode   = c  => ssoLogin(linkedinAuth(c, LINKEDIN_REDIRECT), 'LinkedIn')

  const activeProviders = [
    GOOGLE_CLIENT_ID   && 'google',
    FACEBOOK_APP_ID    && 'facebook',
    LINKEDIN_CLIENT_ID && 'linkedin',
    FACEBOOK_APP_ID    && 'instagram',
  ].filter(Boolean)
  const hasSocial   = activeProviders.length > 0
  const showSocial  = hasSocial && (mode === 'login' || mode === 'register')
  const gridCols    = activeProviders.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
  const anyDisabled = loading || !!ssoLoading

  /* ── Forgot-sent screen ──────────────────────────────────────────────────── */
  if (mode === 'forgot-sent') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-zinc-200/60 border border-zinc-100 p-10 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-5 mx-auto">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">{t('auth.checkEmail')}</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            {t('auth.resetSent')}<br />
            <span className="font-medium text-zinc-700">{form.email}</span>.<br />
            {t('auth.resetExpiry')}
          </p>
          <p className="text-xs text-zinc-400 mt-4 mb-5">{t('auth.noEmail')}</p>
          <button onClick={() => switchMode('login')}
            className="text-sm font-medium text-orange-500 hover:text-orange-600 transition flex items-center gap-1.5 mx-auto">
            <ArrowLeft className="w-3.5 h-3.5" /> {t('auth.backToSignIn')}
          </button>
        </div>
      </div>
    )
  }

  /* ── Main layout ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex bg-zinc-50">

      {/* ── Left brand panel ─────────────────────────────────────────────────── */}
      <div className="hidden lg:flex w-5/12 xl:w-[44%] bg-zinc-900 relative overflow-hidden flex-col">
        {/* Drifting orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 -left-24 w-96 h-96 rounded-full bg-orange-500 opacity-20 blur-3xl animate-orb-1" />
          <div className="absolute -bottom-24 right-0 w-96 h-96 rounded-full bg-amber-500 opacity-15 blur-3xl animate-orb-2" />
          <div className="absolute top-2/3 left-1/3 w-72 h-72 rounded-full bg-orange-400 opacity-10 blur-2xl animate-orb-3" />
        </div>

        <div className="relative flex-1 flex flex-col justify-between p-10 xl:p-14">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-900/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">Inkira</span>
          </div>

          {/* Hero text */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 text-orange-300 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
              <Sparkles className="w-3 h-3" />
              AI Chatbot Assistant
            </div>
            <h2 className="text-4xl xl:text-[2.65rem] font-bold text-white leading-[1.18] mb-4">
              Upload documents,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
                get answers.
              </span>
            </h2>
            <p className="text-zinc-400 text-sm xl:text-[15px] leading-relaxed mb-10 max-w-xs">
              Your AI chatbot assistant — ask anything about your documents and get accurate, multilingual answers.
            </p>

            {/* Feature list */}
            <div className="space-y-3.5">
              {FEATURES.map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-orange-400" />
                  </div>
                  <span className="text-zinc-300 text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>


        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-12">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="text-zinc-900 font-bold text-xl">Inkira</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-zinc-200/70 border border-zinc-100 p-8 xl:p-10 anim-fade-up-0">

          {/* Header */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
              {mode === 'login'    && 'Welcome back'}
              {mode === 'register' && 'Create an account'}
              {mode === 'forgot'   && 'Forgot password?'}
            </h1>
            <p className="text-zinc-500 text-sm mt-1.5">
              {mode === 'login'    && t('auth.subtitle_login')}
              {mode === 'register' && t('auth.subtitle_register')}
              {mode === 'forgot'   && t('auth.subtitle_forgot')}
            </p>
          </div>

          {/* ── SSO section (top for login) ── */}
          {showSocial && (
            <>
              <div className={`grid ${gridCols} gap-2 mb-5`}>
                {GOOGLE_CLIENT_ID && (
                  <GoogleBtn
                    loading={ssoLoading === 'google'}
                    disabled={anyDisabled}
                    onToken={handleGoogleToken}
                    onStart={() => setSso('google')}
                    onError={() => { setError('Google sign-in failed.'); setSso('') }}
                  />
                )}
                {FACEBOOK_APP_ID && (
                  <FacebookLogin
                    appId={FACEBOOK_APP_ID}
                    scope="email,public_profile"
                    onSuccess={res => { setSso('facebook'); handleFacebookToken(res.accessToken) }}
                    onFail={() => { setError('Facebook sign-in failed.'); setSso('') }}
                    className="flex items-center justify-center gap-2 py-2.5 border border-zinc-200 rounded-xl bg-white hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 transition text-sm font-medium text-zinc-700 w-full shadow-sm cursor-pointer"
                    style={{}}
                  >
                    {ssoLoading === 'facebook' ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <FacebookIcon />}
                    Facebook
                  </FacebookLogin>
                )}
                {LINKEDIN_CLIENT_ID && (
                  <LinkedInBtn
                    loading={ssoLoading === 'linkedin'}
                    disabled={anyDisabled}
                    onCode={handleLinkedInCode}
                    onStart={() => setSso('linkedin')}
                    onError={() => { setError('LinkedIn sign-in failed.'); setSso('') }}
                  />
                )}
                {FACEBOOK_APP_ID && (
                  <FacebookLogin
                    appId={FACEBOOK_APP_ID}
                    scope="email,public_profile,instagram_basic"
                    onSuccess={res => { setSso('instagram'); handleInstagramToken(res.accessToken) }}
                    onFail={() => { setError('Instagram sign-in failed.'); setSso('') }}
                    className="flex items-center justify-center gap-2 py-2.5 border border-zinc-200 rounded-xl bg-white hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 transition text-sm font-medium text-zinc-700 w-full shadow-sm cursor-pointer"
                    style={{}}
                  >
                    {ssoLoading === 'instagram' ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <InstagramIcon />}
                    Instagram
                  </FacebookLogin>
                )}
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-zinc-100" />
                <span className="text-xs text-zinc-400 font-medium">or continue with email</span>
                <div className="flex-1 h-px bg-zinc-100" />
              </div>
            </>
          )}

          {/* ── Email / Password form ── */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text" placeholder={t('auth.fullName')}
                  value={form.name} onChange={set('name')} required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent focus:bg-white transition"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="email" placeholder={t('auth.emailAddress')}
                value={form.email} onChange={set('email')} required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent focus:bg-white transition"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type={showPass ? 'text' : 'password'} placeholder={t('auth.password')}
                    value={form.password} onChange={set('password')} required
                    className="w-full pl-10 pr-10 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent focus:bg-white transition"
                  />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === 'register' && (
                  <p className="text-xs text-zinc-400 mt-1.5 ml-1">Minimum 8 characters.</p>
                )}
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end -mt-1">
                <button type="button" onClick={() => switchMode('forgot')}
                  className="text-xs text-zinc-400 hover:text-orange-500 transition font-medium">
                  {t('auth.forgotPassword')}
                </button>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2.5 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3.5 py-2.5">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                <span>{success}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={anyDisabled}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-orange-300 disabled:to-orange-300 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-md shadow-orange-200 hover:shadow-orange-300 hover:-translate-y-px active:translate-y-0 flex items-center justify-center gap-2 mt-1">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />
                  {mode === 'login'    && t('auth.signingIn')}
                  {mode === 'register' && t('auth.creatingAccount')}
                  {mode === 'forgot'   && t('auth.sendingReset')}
                </>
              ) : (
                <>
                  {mode === 'login'    && t('auth.continue')}
                  {mode === 'register' && t('auth.createAccount')}
                  {mode === 'forgot'   && t('auth.sendResetLink')}
                </>
              )}
            </button>

            {mode === 'forgot' && (
              <button type="button" onClick={() => switchMode('login')}
                className="w-full text-sm text-zinc-500 hover:text-zinc-700 transition flex items-center justify-center gap-1.5 mt-1">
                <ArrowLeft className="w-3.5 h-3.5" /> {t('auth.backToSignIn')}
              </button>
            )}
          </form>

          {/* Mode toggle */}
          {(mode === 'login' || mode === 'register') && (
            <p className="text-center text-sm text-zinc-500 mt-6">
              {mode === 'login' ? (
                <>{t('auth.noAccount')}{' '}
                  <button onClick={() => switchMode('register')}
                    className="font-semibold text-zinc-900 hover:text-orange-500 transition">
                    {t('auth.signUp')}
                  </button>
                </>
              ) : (
                <>{t('auth.haveAccount')}{' '}
                  <button onClick={() => switchMode('login')}
                    className="font-semibold text-zinc-900 hover:text-orange-500 transition">
                    {t('auth.signIn')}
                  </button>
                </>
              )}
            </p>
          )}

          {/* Legal */}
          {(mode === 'login' || mode === 'register') && (
            <p className="text-center text-xs text-zinc-400 mt-4 leading-relaxed">
              {t('auth.terms')}{' '}
              <span className="underline cursor-pointer hover:text-zinc-600">{t('auth.termsLink')}</span>{' '}
              {t('auth.and')}{' '}
              <span className="underline cursor-pointer hover:text-zinc-600">{t('auth.privacyLink')}</span>.
            </p>
          )}

        </div>
      </div>

    </div>
  )
}
