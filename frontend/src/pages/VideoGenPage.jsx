import { useState, useEffect, useCallback } from 'react'
import { Loader2, Download, Film } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

// Pollinations fetch resolution → GIF output resolution
const SIZES = [
  { tKey: 'image.sizeSquare',     value: 'square',         aspect: '1:1',  pw: 1024, ph: 1024, gw: 480, gh: 480 },
  { tKey: 'image.sizeLandscape',  value: 'landscape_4_3',  aspect: '4:3',  pw: 1024, ph: 768,  gw: 640, gh: 480 },
  { tKey: 'image.sizePortrait',   value: 'portrait_4_3',   aspect: '3:4',  pw: 768,  ph: 1024, gw: 360, gh: 480 },
  { tKey: 'image.sizeWidescreen', value: 'landscape_16_9', aspect: '16:9', pw: 1280, ph: 720,  gw: 640, gh: 360 },
]

const STYLES = [
  { tKey: 'video.styleCinematic',   value: 'cinematic',   suffix: 'cinematic, dramatic lighting' },
  { tKey: 'video.styleDocumentary', value: 'documentary', suffix: 'documentary style, realistic' },
  { tKey: 'video.styleAnimation',   value: 'animation',   suffix: 'animated, vibrant colors' },
  { tKey: 'video.styleRealistic',   value: 'realistic',   suffix: 'photorealistic, 4K' },
]

const FRAME_COUNTS = [3, 4, 5, 6]

function pollinationsUrl(prompt, w, h) {
  const seed = Math.floor(Math.random() * 999999)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`
}

async function blobToDataUrl(blob) {
  return new Promise(resolve => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.readAsDataURL(blob)
  })
}

async function fetchFrameAsDataUrl(prompt, w, h) {
  const url = pollinationsUrl(prompt, w, h)
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`Frame fetch failed: HTTP ${res.status}`)
  const blob = await res.blob()
  return blobToDataUrl(blob)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for GIF encoding'))
    img.src = src
  })
}

// Encodes an array of data-URL frames into an animated GIF data URL.
// Uses gifenc — no web workers, fully synchronous after image decode.
async function encodeAnimatedGif(frameDataUrls, gw, gh, delayMs = 400) {
  const canvas = document.createElement('canvas')
  canvas.width = gw
  canvas.height = gh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const gif = GIFEncoder()

  for (const dataUrl of frameDataUrls) {
    const img = await loadImage(dataUrl)
    ctx.clearRect(0, 0, gw, gh)
    ctx.drawImage(img, 0, 0, gw, gh)
    const { data } = ctx.getImageData(0, 0, gw, gh)
    const palette = quantize(data, 256, { format: 'rgba4444' })
    const index   = applyPalette(data, palette, 'rgba4444')
    gif.writeFrame(index, gw, gh, { palette, delay: delayMs })
  }

  gif.finish()
  const bytes = gif.bytesView()

  // Chunked btoa to avoid call-stack overflow on large buffers
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return `data:image/gif;base64,${btoa(binary)}`
}

export default function VideoGenPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const storageKey = `vid_history_${user?.id}`

  const [prompt,  setPrompt]  = useState('')
  const [size,    setSize]    = useState(SIZES[0])
  const [style,   setStyle]   = useState(STYLES[0])
  const [frames,  setFrames]  = useState(4)
  const [items,   setItems]   = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`vid_history_${user?.id}`) || '[]')
      return saved.map(it => it.status === 'loading' ? { ...it, status: 'error', error: 'Interrupted' } : it)
    } catch { return [] }
  })

  // Keep last 4 GIFs — they can be large, stay safe with localStorage quota
  useEffect(() => {
    try {
      const toStore = items.filter(it => it.status !== 'loading').slice(0, 4)
      localStorage.setItem(storageKey, JSON.stringify(toStore))
    } catch { /* quota exceeded */ }
  }, [items, storageKey])

  const runGenerate = useCallback(async (id, fullPrompt, sizeObj, numFrames) => {
    const onStatus = msg =>
      setItems(prev => prev.map(it => it.id === id ? { ...it, loadStatus: msg } : it))

    try {
      // Phase 1: fetch frames from Pollinations.ai
      const frameUrls = []
      for (let i = 0; i < numFrames; i++) {
        onStatus(t('video.fetchingFrame', { n: i + 1, total: numFrames }))
        const dataUrl = await fetchFrameAsDataUrl(fullPrompt, sizeObj.pw, sizeObj.ph)
        frameUrls.push(dataUrl)
      }

      // Phase 2: encode into animated GIF
      onStatus(t('video.encodingGif'))
      const gifUrl = await encodeAnimatedGif(frameUrls, sizeObj.gw, sizeObj.gh)

      setItems(prev => prev.map(it =>
        it.id === id ? { ...it, url: gifUrl, status: 'done', loadStatus: '' } : it
      ))
    } catch (err) {
      setItems(prev => prev.map(it =>
        it.id === id ? { ...it, status: 'error', loadStatus: '', error: err.message || t('video.failed') } : it
      ))
    }
  }, [t])

  const handleGenerate = () => {
    if (!prompt.trim()) return
    const id = `vid_${Date.now()}`
    const fullPrompt = `${prompt.trim()}, ${style.suffix}`
    setItems(prev => [
      { id, prompt: prompt.trim(), sizeValue: size.value, style: style.value, numFrames: frames,
        status: 'loading', url: null, loadStatus: t('video.fetchingFrame', { n: 1, total: frames }) },
      ...prev,
    ])
    runGenerate(id, fullPrompt, size, frames)
  }

  const handleRetry = (item) => {
    const sizeObj  = SIZES.find(s => s.value === item.sizeValue)  || SIZES[0]
    const styleObj = STYLES.find(s => s.value === item.style)     || STYLES[0]
    const num      = item.numFrames || 4
    const fullPrompt = `${item.prompt}, ${styleObj.suffix}`
    setItems(prev => prev.map(it =>
      it.id === item.id
        ? { ...it, status: 'loading', url: null, error: null, loadStatus: t('video.fetchingFrame', { n: 1, total: num }) }
        : it
    ))
    runGenerate(item.id, fullPrompt, sizeObj, num)
  }

  const anyLoading = items.some(it => it.status === 'loading')

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">

        {/* Header */}
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

          {/* Style */}
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

          {/* Size */}
          <div>
            <p className="text-xs text-zinc-400 mb-2">{t('image.sizeLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {SIZES.map(s => (
                <button key={s.value} onClick={() => setSize(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${size.value === s.value ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-200 text-zinc-600 hover:border-orange-300 hover:text-orange-600'}`}>
                  {t(s.tKey)} <span className="opacity-60">{s.aspect}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Frame count */}
          <div>
            <p className="text-xs text-zinc-400 mb-2">{t('video.framesLabel')}</p>
            <div className="flex gap-2">
              {FRAME_COUNTS.map(n => (
                <button key={n} onClick={() => setFrames(n)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${frames === n ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-200 text-zinc-600 hover:border-orange-300 hover:text-orange-600'}`}>
                  {n} {t('video.frames')}
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
                      <p className="text-xs text-zinc-500">{it.loadStatus}</p>
                    </div>
                  ) : (
                    <>
                      <img src={it.url} alt={it.prompt} className="w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                        <p className="text-xs text-white/80 line-clamp-2">{it.prompt}</p>
                      </div>
                      <a href={it.url} download="animated.gif" target="_blank" rel="noreferrer"
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
