import { useState, useEffect, useCallback } from 'react'
import { Loader2, Download, Film } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { generateVideo } from '../api/client'

const STYLES = [
  { tKey: 'video.styleCinematic',   value: 'cinematic',   suffix: 'cinematic, dramatic lighting' },
  { tKey: 'video.styleDocumentary', value: 'documentary', suffix: 'documentary style, realistic' },
  { tKey: 'video.styleAnimation',   value: 'animation',   suffix: 'animated, vibrant colors' },
  { tKey: 'video.styleRealistic',   value: 'realistic',   suffix: 'photorealistic, 4K' },
]

export default function VideoGenPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const storageKey = `vid_history_${user?.id}`

  const [prompt, setPrompt] = useState('')
  const [style, setStyle]   = useState(STYLES[0])
  const [items, setItems]   = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`vid_history_${user?.id}`) || '[]')
      return saved.map(it => it.status === 'loading' ? { ...it, status: 'error', error: 'Interrupted' } : it)
    } catch {
      return []
    }
  })

  // Keep last 4 videos to stay within localStorage quota
  useEffect(() => {
    try {
      const toStore = items.filter(it => it.status !== 'loading').slice(0, 4)
      localStorage.setItem(storageKey, JSON.stringify(toStore))
    } catch { /* quota exceeded */ }
  }, [items, storageKey])

  const runGenerate = useCallback((id, fullPrompt) => {
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, loadStatus: t('video.generating') } : it
    ))

    generateVideo({ prompt: fullPrompt })
      .then(res => {
        setItems(prev => prev.map(it =>
          it.id === id ? { ...it, url: res.data.video_url, status: 'done', loadStatus: '' } : it
        ))
      })
      .catch(err => {
        const msg = err.response?.data?.detail || err.message || t('video.errorUnknown')
        setItems(prev => prev.map(it =>
          it.id === id ? { ...it, status: 'error', loadStatus: '', error: msg } : it
        ))
      })
  }, [t])

  const handleGenerate = () => {
    if (!prompt.trim()) return
    const id = `vid_${Date.now()}`
    const fullPrompt = `${prompt.trim()}, ${style.suffix}`
    setItems(prev => [
      { id, prompt: prompt.trim(), style: style.value, status: 'loading', url: null, loadStatus: t('video.generating') },
      ...prev,
    ])
    runGenerate(id, fullPrompt)
  }

  const handleRetry = (item) => {
    const styleObj = STYLES.find(s => s.value === item.style) || STYLES[0]
    const fullPrompt = `${item.prompt}, ${styleObj.suffix}`
    setItems(prev => prev.map(it =>
      it.id === item.id ? { ...it, status: 'loading', url: null, error: null, loadStatus: t('video.generating') } : it
    ))
    runGenerate(item.id, fullPrompt)
  }

  const anyLoading = items.some(it => it.status === 'loading')

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-900">{t('video.title')}</h1>
          </div>
          <p className="text-sm text-zinc-500 ml-12">{t('video.subtitle')}</p>
        </div>

        {/* Prompt card */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">{t('video.promptLabel')}</p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
              placeholder={t('video.placeholder')}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">{t('video.styleLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {STYLES.map(s => (
                <button key={s.value} onClick={() => setStyle(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${style.value === s.value ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-200 text-zinc-600 hover:border-orange-300 hover:text-orange-600'}`}>
                  {t(s.tKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{t('video.freeBadge')}</span>
            <span className="text-xs text-zinc-400">{t('video.via')}</span>
          </div>
        </div>

        <button onClick={handleGenerate} disabled={!prompt.trim() || anyLoading}
          className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition mb-8">
          <Film className="w-4 h-4" />
          {anyLoading ? t('video.generatingBtn') : t('video.generateBtn')}
        </button>

        {/* History */}
        {items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                {t('video.history')}
                <span className="ml-1.5 text-[10px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 font-bold">{items.length}</span>
              </p>
              <button onClick={() => setItems([])} className="text-xs text-zinc-400 hover:text-red-500 transition">{t('video.clearAll')}</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map(it => (
                <div key={it.id} className="rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 relative group min-h-[200px] flex items-center justify-center">
                  {it.status === 'error' ? (
                    <div className="text-center p-4 space-y-2">
                      <p className="text-xs text-red-500">{it.error || t('video.failed')}</p>
                      <button onClick={() => handleRetry(it)}
                        className="text-xs font-medium text-orange-500 hover:text-orange-700 underline transition">
                        {t('video.retry')}
                      </button>
                    </div>
                  ) : it.status === 'loading' ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
                      <p className="text-xs text-zinc-500">{it.loadStatus || t('video.generating')}</p>
                    </div>
                  ) : (
                    <>
                      <video
                        src={it.url}
                        controls
                        autoPlay
                        loop
                        muted
                        className="w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                        <p className="text-xs text-white/80 line-clamp-2">{it.prompt}</p>
                      </div>
                      <a href={it.url} download="generated.mp4" target="_blank" rel="noreferrer"
                        className="absolute top-2 right-2 w-8 h-8 bg-zinc-900/70 hover:bg-zinc-900 text-white rounded-full flex items-center justify-center transition opacity-0 group-hover:opacity-100">
                        <Download className="w-4 h-4" />
                      </a>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
