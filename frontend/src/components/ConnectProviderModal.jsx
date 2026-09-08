import { useState } from 'react'
import { X, ExternalLink, CheckCircle, Eye, EyeOff, Key, ArrowLeft, Zap, Loader2 } from 'lucide-react'
import { saveProviderKey } from '../api/client'

const PROVIDER_META = {
  openai: {
    name: 'OpenAI',
    headline: 'Connect OpenAI',
    description: 'Access GPT-4o and GPT-4o Mini.',
    iconBg: 'bg-zinc-900',
    iconLabel: 'O',
    headerBg: 'bg-zinc-900',
    accentCls: 'bg-zinc-900 hover:bg-zinc-700 text-white',
    keyUrl: 'https://platform.openai.com/api-keys',
    siteName: 'OpenAI Platform',
    goLabel: 'Sign in to OpenAI →',
    placeholder: 'sk-proj-...',
    keyHint: 'Starts with sk-',
    validateKey: k => k.startsWith('sk-') && k.length > 20,
    models: ['GPT-4o', 'GPT-4o Mini'],
  },
  anthropic: {
    name: 'Anthropic',
    headline: 'Connect Anthropic',
    description: 'Access Claude Opus, Sonnet, and Haiku.',
    iconBg: 'bg-amber-600',
    iconLabel: 'A',
    headerBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    accentCls: 'bg-amber-600 hover:bg-amber-500 text-white',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    siteName: 'Anthropic Console',
    goLabel: 'Sign in to Anthropic →',
    placeholder: 'sk-ant-...',
    keyHint: 'Starts with sk-ant-',
    validateKey: k => k.startsWith('sk-ant-') && k.length > 20,
    models: ['Claude Opus 4', 'Claude Sonnet 4', 'Claude Haiku 4.5'],
  },
  google: {
    name: 'Google',
    headline: 'Connect Google AI',
    description: 'Access Gemini 2.0 Flash and Gemini 1.5 Pro.',
    iconBg: 'bg-blue-600',
    iconLabel: 'G',
    headerBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
    accentCls: 'bg-blue-600 hover:bg-blue-500 text-white',
    keyUrl: 'https://aistudio.google.com/apikey',
    siteName: 'Google AI Studio',
    goLabel: 'Sign in to Google AI Studio →',
    placeholder: 'AIzaSy...',
    keyHint: 'Free key — no billing required',
    validateKey: k => k.length > 10,
    models: ['Gemini 2.0 Flash', 'Gemini 1.5 Pro', 'Gemini 1.5 Flash'],
  },
}

export default function ConnectProviderModal({
  provider,
  onClose,
  onConnected,
  platformConfigured = ['groq'],
}) {
  const meta = PROVIDER_META[provider?.id]
  if (!provider || !meta) return null

  // If platform already has a key for this provider → one-click connect
  const isOnPlatform = platformConfigured.includes(provider.id)

  // Steps:
  //   platform flow → 'ready' | 'saving' | 'done'
  //   BYOK flow     → 'signin' | 'paste' | 'saving' | 'done' | 'error'
  const [step, setStep]       = useState(isOnPlatform ? 'ready' : 'signin')
  const [apiKey, setApiKey]   = useState('')
  const [showKey, setShowKey] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isValidFormat = meta.validateKey(apiKey.trim())

  /* ── save to backend ─────────────────────────────────────────────── */
  const persistKey = async (providerId, key) => {
    setStep('saving')
    try {
      await saveProviderKey(providerId, key)
    } catch {
      setErrorMsg('Could not save your key — please try again.')
      setStep('error')
      return
    }
    setStep('done')
    setTimeout(() => { onConnected?.(providerId, key); onClose() }, 900)
  }

  /* ── platform one-click ──────────────────────────────────────────── */
  const handlePlatformConnect = () => persistKey(provider.id, 'platform')

  /* ── BYOK: open provider site ────────────────────────────────────── */
  const handleGoToSite = () => {
    window.open(meta.keyUrl, '_blank', 'noopener,noreferrer')
    setStep('paste')
  }

  /* ── BYOK: validate + save key ───────────────────────────────────── */
  const handlePasteConnect = () => {
    const trimmed = apiKey.trim()
    if (!trimmed) { setErrorMsg('Please paste your API key.'); setStep('error'); return }
    if (!isValidFormat) {
      setErrorMsg(`This doesn't look like a valid ${meta.name} key. ${meta.keyHint}.`)
      setStep('error')
      return
    }
    persistKey(provider.id, trimmed)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Colored header */}
        <div className={`${meta.headerBg} px-6 pt-6 pb-8 relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
          <div className={`w-12 h-12 rounded-2xl ${meta.iconBg} flex items-center justify-center mb-4 shadow-lg`}>
            <span className="text-white text-xl font-bold">{meta.iconLabel}</span>
          </div>
          <h2 className="text-lg font-semibold text-white">{meta.headline}</h2>
          <p className="text-sm text-white/80 mt-1">{meta.description}</p>
        </div>

        {/* Body */}
        <div className="-mt-4 bg-white rounded-t-2xl px-6 pt-5 pb-6">
          {/* Model chips */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            {meta.models.map(m => (
              <span key={m} className="text-xs bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-full font-medium">{m}</span>
            ))}
          </div>

          {/* ── Platform one-click ─────────────────────────────────────── */}
          {step === 'ready' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                <Zap className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800">{meta.name} is ready on this platform</p>
                  <p className="text-xs text-green-600 mt-0.5">No sign-in or API key needed — just click Connect.</p>
                </div>
              </div>
              <button onClick={handlePlatformConnect} className={`w-full py-3 rounded-xl font-semibold text-sm transition ${meta.accentCls}`}>
                Connect {meta.name}
              </button>
              <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-500 hover:bg-zinc-50 transition">
                Cancel
              </button>
            </div>
          )}

          {/* ── BYOK step 1: sign in to get key ────────────────────────── */}
          {step === 'signin' && (
            <div className="space-y-3">
              <div className="bg-zinc-50 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm font-medium text-zinc-800">How to connect {meta.name}:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-zinc-500">
                  <li>Click the button below to sign in to {meta.siteName}</li>
                  <li>Go to <span className="font-medium text-zinc-700">API Keys</span> and create a new key</li>
                  <li>Copy the key and come back here to paste it</li>
                </ol>
                <p className="text-[11px] text-zinc-400 pt-1">
                  Your key is saved securely — you only need to do this once.
                </p>
              </div>

              <button
                onClick={handleGoToSite}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition ${meta.accentCls}`}
              >
                <ExternalLink className="w-4 h-4" />
                {meta.goLabel}
              </button>

              {/* If they already have a key, skip to paste */}
              <button
                onClick={() => setStep('paste')}
                className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-600 transition"
              >
                I already have an API key →
              </button>

              <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-500 hover:bg-zinc-50 transition">
                Cancel
              </button>
            </div>
          )}

          {/* ── BYOK step 2: paste key ──────────────────────────────────── */}
          {(step === 'paste' || step === 'error') && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                ✓ Welcome back! Paste your {meta.name} API key below to finish connecting.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Your API Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); if (step === 'error') setStep('paste') }}
                    placeholder={meta.placeholder}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-mono text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition"
                  />
                  <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-500 transition">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {apiKey.trim() && (
                  <p className={`text-xs ${isValidFormat ? 'text-green-600' : 'text-zinc-400'}`}>
                    {isValidFormat ? '✓ Key format looks correct' : meta.keyHint}
                  </p>
                )}
              </div>

              {step === 'error' && errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorMsg}</p>
              )}

              <button
                onClick={handlePasteConnect}
                disabled={!apiKey.trim()}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold text-sm transition"
              >
                Save & Connect {meta.name}
              </button>

              <button onClick={() => setStep('signin')} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-400 hover:text-zinc-600 transition">
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
            </div>
          )}

          {/* ── Saving ─────────────────────────────────────────────────── */}
          {step === 'saving' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
              <p className="text-sm text-zinc-500">Saving your connection…</p>
            </div>
          )}

          {/* ── Done ───────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{meta.name} connected!</p>
                <p className="text-xs text-zinc-500 mt-0.5">You're all set. Your key is saved — next time you sign in it will be automatically available.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
