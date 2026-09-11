import { useState, useEffect, useRef } from 'react'
import Vapi from '@vapi-ai/web'
import { Mic, X } from 'lucide-react'

const VAPI_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || ''
const BASE_URL  = import.meta.env.VITE_API_BASE_URL || '/api'

const DEEPGRAM_LANG = {
  en: 'en-US', hi: 'hi', es: 'es', fr: 'fr', de: 'de', ar: 'ar',
}

const AZURE_VOICE = {
  en: 'en-US-AndrewNeural',
  hi: 'hi-IN-SwaraNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  ar: 'ar-SA-ZariyahNeural',
}

export default function VoiceButton({ disabled, language, onUserTranscript, onAssistantTranscript }) {
  const [active, setActive]     = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const vapiRef = useRef(null)

  useEffect(() => {
    if (!VAPI_KEY) return
    const vapi = new Vapi(VAPI_KEY)
    vapiRef.current = vapi

    vapi.on('call-start',   () => setActive(true))
    vapi.on('call-end',     () => { setActive(false); setSpeaking(false) })
    vapi.on('speech-start', () => setSpeaking(true))
    vapi.on('speech-end',   () => setSpeaking(false))
    vapi.on('message', msg => {
      if (msg.type !== 'transcript' || msg.transcriptType !== 'final') return
      if (msg.role === 'user')      onUserTranscript?.(msg.transcript)
      if (msg.role === 'assistant') onAssistantTranscript?.(msg.transcript)
    })
    vapi.on('error', err => console.error('[Vapi]', err))

    return () => { vapi.stop() }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const vapi = vapiRef.current
    if (!vapi) return

    if (active) {
      vapi.stop()
      return
    }

    const lang  = language || 'en'
    const token = localStorage.getItem('inkira_token') || ''

    vapi.start({
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: DEEPGRAM_LANG[lang] || 'en-US',
      },
      model: {
        provider: 'custom-llm',
        url: `${BASE_URL}/vapi/chat/completions`,
        headers: { Authorization: `Bearer ${token}` },
        model: 'medical-rag',
      },
      voice: {
        provider: 'azure',
        voiceId: AZURE_VOICE[lang] || 'en-US-AndrewNeural',
      },
      firstMessage: 'Hello! How can I help you today?',
    })
  }

  if (!VAPI_KEY) return null

  /* ── Active call pill ─────────────────────────────────────────────────── */
  if (active) {
    return (
      <div className="flex items-center gap-2 bg-zinc-900 text-white rounded-full px-3 py-1.5 shadow-md">
        {/* Waveform */}
        <div className="flex items-center gap-[3px] h-3.5">
          {speaking ? (
            [1,2,3,4,5].map(n => (
              <div
                key={n}
                className={`w-[3px] rounded-full bg-green-400 voice-bar-${n}`}
              />
            ))
          ) : (
            [1,2,3,4,5].map(n => (
              <div key={n} className="w-[3px] h-[3px] rounded-full bg-zinc-500" />
            ))
          )}
        </div>

        {/* Status label */}
        <span className="text-[11px] font-medium leading-none whitespace-nowrap">
          {speaking ? 'Listening…' : 'AI speaking…'}
        </span>

        {/* End call button */}
        <button
          onClick={toggle}
          title="End voice call"
          className="w-4 h-4 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    )
  }

  /* ── Idle mic button ──────────────────────────────────────────────────── */
  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title="Start voice chat"
      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-orange-500 hover:bg-orange-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <Mic className="w-4 h-4" />
    </button>
  )
}
