import { useState } from 'react'
import { Bot, Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'
import { login as apiLogin, register as apiRegister } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

export default function AuthPage() {
  const { login } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ email: '', name: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = field => e =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const switchMode = () => {
    setMode(m => (m === 'login' ? 'register' : 'login'))
    setError('')
    setForm({ email: form.email, name: '', password: '' })
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } =
        mode === 'login'
          ? await apiLogin(form.email, form.password)
          : await apiRegister(form.email, form.name, form.password)
      login(data.access_token, data.user)
    } catch (err) {
      setError(
        err.response?.data?.detail || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mb-4">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
            Inkira
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {mode === 'login'
              ? 'Sign in to continue your conversations'
              : 'Create your account to get started'}
          </p>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name — only on register */}
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Full name"
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
              placeholder="Email address"
              value={form.email}
              onChange={set('email')}
              required
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
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
              {showPass ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

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
                {mode === 'login' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : (
              'Continue'
            )}
          </button>
        </form>

        {/* Switch mode */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={switchMode}
                className="font-semibold text-zinc-900 hover:text-orange-500 transition"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={switchMode}
                className="font-semibold text-zinc-900 hover:text-orange-500 transition"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        {/* Legal */}
        <p className="text-center text-xs text-zinc-400 mt-6 leading-relaxed">
          By continuing, you agree to our{' '}
          <span className="underline cursor-pointer hover:text-zinc-600">
            Terms of Service
          </span>{' '}
          and{' '}
          <span className="underline cursor-pointer hover:text-zinc-600">
            Privacy Policy
          </span>
          .
        </p>
      </div>
    </div>
  )
}
