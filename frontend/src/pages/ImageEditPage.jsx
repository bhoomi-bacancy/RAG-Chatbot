import { useState, useRef } from 'react'
import { Upload, Wand2, Loader2, Download, RotateCcw, ImagePlus } from 'lucide-react'
import { editImage } from '../api/client'

const AZIMUTHS = [
  { label: 'Front',       value: 'front view' },
  { label: 'Front-Right', value: 'front-right quarter view' },
  { label: 'Right',       value: 'right side view' },
  { label: 'Back-Right',  value: 'back-right quarter view' },
  { label: 'Back',        value: 'back view' },
  { label: 'Back-Left',   value: 'back-left quarter view' },
  { label: 'Left',        value: 'left side view' },
  { label: 'Front-Left',  value: 'front-left quarter view' },
]

const ELEVATIONS = [
  { label: 'High',      value: 'high-angle shot' },
  { label: 'Elevated',  value: 'elevated shot' },
  { label: 'Eye-level', value: 'eye-level shot' },
  { label: 'Low',       value: 'low-angle shot' },
]

const DISTANCES = [
  { label: 'Close-up', value: 'close-up' },
  { label: 'Medium',   value: 'medium shot' },
  { label: 'Wide',     value: 'wide shot' },
]

export default function ImageEditPage() {
  const [inputImage, setInputImage]   = useState(null)   // base64 data URL
  const [outputImage, setOutputImage] = useState(null)   // URL from fal.ai
  const [azimuth, setAzimuth]         = useState(AZIMUTHS[0])
  const [elevation, setElevation]     = useState(ELEVATIONS[2])
  const [distance, setDistance]       = useState(DISTANCES[1])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const fileInputRef = useRef(null)

  const prompt = `${azimuth.value} ${elevation.value} ${distance.value}`

  const compressImage = (file) => new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1024
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.src = url
  })

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await compressImage(file)
    setInputImage(dataUrl)
    setOutputImage(null)
    setError('')
    e.target.value = ''
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await compressImage(file)
    setInputImage(dataUrl)
    setOutputImage(null)
    setError('')
  }

  const handleGenerate = async () => {
    if (!inputImage || loading) return
    setLoading(true)
    setError('')
    setOutputImage(null)
    try {
      const { data } = await editImage({ image_url: inputImage, prompt, lora_scale: 0.9 })
      setOutputImage(data.image_url)
    } catch (err) {
      setError(err.response?.data?.detail || 'Image generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setInputImage(null)
    setOutputImage(null)
    setError('')
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-900">Image Edit</h1>
          </div>
          <p className="text-sm text-zinc-500 ml-12">
            Re-imagine your image from any camera angle using Qwen-Image-Edit + LoRA
          </p>
        </div>

        {/* Camera controls */}
        <div className="mb-6 bg-zinc-50 border border-zinc-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Camera Angle</p>
          <div className="space-y-4">

            {/* Azimuth */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">Direction (Azimuth)</p>
              <div className="flex flex-wrap gap-2">
                {AZIMUTHS.map(a => (
                  <button
                    key={a.value}
                    onClick={() => setAzimuth(a)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                      azimuth.value === a.value
                        ? 'bg-violet-500 border-violet-500 text-white'
                        : 'border-zinc-200 text-zinc-600 hover:border-violet-300 hover:text-violet-600'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Elevation */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">Height (Elevation)</p>
              <div className="flex flex-wrap gap-2">
                {ELEVATIONS.map(e => (
                  <button
                    key={e.value}
                    onClick={() => setElevation(e)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                      elevation.value === e.value
                        ? 'bg-violet-500 border-violet-500 text-white'
                        : 'border-zinc-200 text-zinc-600 hover:border-violet-300 hover:text-violet-600'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance */}
            <div>
              <p className="text-xs text-zinc-400 mb-2">Distance</p>
              <div className="flex flex-wrap gap-2">
                {DISTANCES.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setDistance(d)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                      distance.value === d.value
                        ? 'bg-violet-500 border-violet-500 text-white'
                        : 'border-zinc-200 text-zinc-600 hover:border-violet-300 hover:text-violet-600'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt preview */}
            <div className="pt-2 border-t border-zinc-200">
              <p className="text-xs text-zinc-400">Prompt</p>
              <p className="text-xs font-mono text-violet-700 mt-0.5 bg-violet-50 px-3 py-1.5 rounded-lg inline-block">
                &lt;sks&gt; {prompt}
              </p>
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Input */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Input Image</p>
            {inputImage ? (
              <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 aspect-square">
                <img src={inputImage} alt="Input" className="w-full h-full object-contain" />
                <button
                  onClick={handleReset}
                  className="absolute top-2 right-2 w-7 h-7 bg-zinc-900/70 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-200 hover:border-violet-400 rounded-2xl aspect-square flex flex-col items-center justify-center gap-3 cursor-pointer transition group"
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-100 group-hover:bg-violet-50 flex items-center justify-center transition">
                  <ImagePlus className="w-6 h-6 text-zinc-400 group-hover:text-violet-500 transition" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-600 group-hover:text-violet-600 transition">Drop image here</p>
                  <p className="text-xs text-zinc-400 mt-0.5">or click to browse</p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            )}
          </div>

          {/* Output */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Generated Image</p>
            <div className="border border-zinc-200 rounded-2xl aspect-square flex items-center justify-center bg-zinc-50 overflow-hidden relative">
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                  <p className="text-sm text-zinc-500">Generating...</p>
                </div>
              ) : outputImage ? (
                <>
                  <img src={outputImage} alt="Output" className="w-full h-full object-contain" />
                  <a
                    href={outputImage}
                    download="generated.png"
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-2 right-2 w-8 h-8 bg-zinc-900/70 hover:bg-zinc-900 text-white rounded-full flex items-center justify-center transition"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </>
              ) : (
                <div className="text-center px-4">
                  <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">Result will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!inputImage || loading}
          className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
          ) : (
            <><Wand2 className="w-4 h-4" /> Generate</>
          )}
        </button>
      </div>
    </div>
  )
}
