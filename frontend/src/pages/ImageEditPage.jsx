import { useState, useEffect, useCallback } from 'react'
import { Loader2, Download, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const SIZES = [
  { label: 'Square',     value: 'square',         aspect: '1:1'  },
  { label: 'Landscape',  value: 'landscape_4_3',  aspect: '4:3'  },
  { label: 'Portrait',   value: 'portrait_4_3',   aspect: '3:4'  },
  { label: 'Widescreen', value: 'landscape_16_9', aspect: '16:9' },
]

const SIZE_MAP = {
  square:         { w: 1024, h: 1024 },
  landscape_4_3:  { w: 1024, h: 768  },
  portrait_4_3:   { w: 768,  h: 1024 },
  landscape_16_9: { w: 1280, h: 720  },
}

function pollinationsUrl(prompt, sizeValue) {
  const { w, h } = SIZE_MAP[sizeValue] || SIZE_MAP.square
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

// Fetch image from Pollinations with up to 3 attempts, returns a data URL
async function fetchImage(prompt, sizeValue, onStatus) {
  const MAX = 3
  let lastErr = 'Unknown error'
  for (let attempt = 0; attempt < MAX; attempt++) {
    if (attempt > 0) {
      onStatus(`Retrying… (attempt ${attempt + 1}/${MAX})`)
      await new Promise(r => setTimeout(r, 5000))
    } else {
      onStatus('Generating…')
    }
    const url = pollinationsUrl(prompt, sizeValue)
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!res.ok) { lastErr = `Server error ${res.status}`; continue }
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('image')) { lastErr = 'Unexpected response from server'; continue }
      const blob = await res.blob()
      return await blobToDataUrl(blob)
    } catch (err) {
      lastErr = err.name === 'TimeoutError' ? 'Request timed out' : (err.message || 'Network error')
    }
  }
  throw new Error(lastErr)
}

export default function ImageEditPage() {
  const { user } = useAuth()
  const storageKey = `img_history_${user?.id}`

  const [prompt, setPrompt] = useState('')
  const [size, setSize]     = useState(SIZES[0])
  const [items, setItems]   = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`img_history_${user?.id}`) || '[]')
      return saved.map(it => it.status === 'loading' ? { ...it, status: 'error', loadStatus: '' } : it)
    } catch {
      return []
    }
  })

  // Persist to localStorage — only done/error items, keep last 8 to avoid quota
  useEffect(() => {
    try {
      const toStore = items
        .filter(it => it.status !== 'loading')
        .slice(0, 8)
      localStorage.setItem(storageKey, JSON.stringify(toStore))
    } catch { /* quota exceeded */ }
  }, [items, storageKey])

  const runFetch = useCallback((id, prompt, sizeValue) => {
    const onStatus = msg =>
      setItems(prev => prev.map(it => it.id === id ? { ...it, loadStatus: msg } : it))

    fetchImage(prompt, sizeValue, onStatus)
      .then(dataUrl => {
        setItems(prev => prev.map(it =>
          it.id === id ? { ...it, url: dataUrl, status: 'done', loadStatus: '' } : it
        ))
      })
      .catch(err => {
        setItems(prev => prev.map(it =>
          it.id === id ? { ...it, status: 'error', loadStatus: '', error: err.message } : it
        ))
      })
  }, [])

  const handleGenerate = () => {
    if (!prompt.trim()) return
    const id = `gen_${Date.now()}`
    setItems(prev => [{ id, prompt: prompt.trim(), sizeValue: size.value, status: 'loading', url: null, loadStatus: 'Generating…' }, ...prev])
    runFetch(id, prompt.trim(), size.value)
  }

  const handleRetry = (item) => {
    setItems(prev => prev.map(it =>
      it.id === item.id ? { ...it, status: 'loading', url: null, error: null, loadStatus: 'Generating…' } : it
    ))
    runFetch(item.id, item.prompt, item.sizeValue || 'square')
  }

  const anyLoading = items.some(it => it.status === 'loading')

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-900">Image Generation</h1>
          </div>
          <p className="text-sm text-zinc-500 ml-12">Generate images with FLUX · free · no signup</p>
        </div>

        {/* Prompt card */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Prompt</p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
              placeholder="A futuristic city at sunset, photorealistic, 8K…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">Image Size</p>
            <div className="flex flex-wrap gap-2">
              {SIZES.map(s => (
                <button key={s.value} onClick={() => setSize(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${size.value === s.value ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-200 text-zinc-600 hover:border-orange-300 hover:text-orange-600'}`}>
                  {s.label} <span className="opacity-60">{s.aspect}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">FLUX · Free</span>
            <span className="text-xs text-zinc-400">via Pollinations.ai · ~15-30s</span>
          </div>
        </div>

        <button onClick={handleGenerate} disabled={!prompt.trim() || anyLoading}
          className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition mb-8">
          <Sparkles className="w-4 h-4" />
          {anyLoading ? 'Generating… (please wait)' : 'Generate with FLUX'}
        </button>

        {/* History */}
        {items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                History
                <span className="ml-1.5 text-[10px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 font-bold">{items.length}</span>
              </p>
              <button onClick={() => setItems([])} className="text-xs text-zinc-400 hover:text-red-500 transition">Clear all</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map(it => (
                <div key={it.id} className="rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 relative group min-h-[200px] flex items-center justify-center">
                  {it.status === 'error' ? (
                    <div className="text-center p-4 space-y-2">
                      <p className="text-xs text-red-500">{it.error || 'Generation failed'}</p>
                      <button onClick={() => handleRetry(it)}
                        className="text-xs font-medium text-orange-500 hover:text-orange-700 underline transition">
                        Retry
                      </button>
                    </div>
                  ) : it.status === 'loading' ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <Loader2 className="w-7 h-7 text-orange-500 animate-spin" />
                      <p className="text-xs text-zinc-500">{it.loadStatus || 'Generating…'}</p>
                    </div>
                  ) : (
                    <>
                      <img src={it.url} alt={it.prompt} className="w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition">
                        <p className="text-xs text-white/80 line-clamp-2">{it.prompt}</p>
                      </div>
                      <a href={it.url} download="generated.png" target="_blank" rel="noreferrer"
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
