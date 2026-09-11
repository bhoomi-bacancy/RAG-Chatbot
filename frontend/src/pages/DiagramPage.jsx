import { useState, useEffect, useRef, useCallback } from 'react'
import mermaid from 'mermaid'
import {
  GitFork, Sparkles, Copy, Download, Check, Loader2,
  AlertCircle, Menu, ChevronDown, RotateCcw,
} from 'lucide-react'
import { generateDiagram } from '../api/client'

// ── Mermaid init ──────────────────────────────────────────────────────────────
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
})

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATES = {
  Flowchart: `graph TD
    A([Patient Arrives]) --> B[Registration]
    B --> C[Triage Assessment]
    C --> D{Severity?}
    D -->|Critical| E[Emergency Room]
    D -->|Moderate| F[Urgent Care]
    D -->|Minor| G[General OPD]
    E --> H[Treatment]
    F --> H
    G --> H
    H --> I{Admitted?}
    I -->|Yes| J[Ward / ICU]
    I -->|No| K([Discharge])
    J --> K`,

  Sequence: `sequenceDiagram
    participant P as Patient
    participant D as Doctor
    participant L as Laboratory
    participant Ph as Pharmacy

    P->>D: Book Appointment
    D->>P: Conduct Examination
    D->>L: Order Tests
    L-->>D: Return Results
    D->>D: Analyze Results
    D->>P: Share Diagnosis
    D->>Ph: Send Prescription
    Ph-->>P: Dispense Medication`,

  'Class Diagram': `classDiagram
    class Patient {
        +String id
        +String name
        +Date dob
        +String bloodGroup
        +getAge() int
    }
    class Doctor {
        +String id
        +String name
        +String specialization
        +prescribe(Patient) Prescription
    }
    class Prescription {
        +String id
        +Date issuedOn
        +List~Medication~ medications
    }
    class Medication {
        +String name
        +String dosage
        +int durationDays
    }
    Patient "1" --> "many" Prescription
    Doctor "1" --> "many" Prescription
    Prescription "1" *-- "many" Medication`,

  'ER Diagram': `erDiagram
    PATIENT {
        uuid id PK
        string name
        date dob
        string blood_group
    }
    DOCTOR {
        uuid id PK
        string name
        string specialization
    }
    APPOINTMENT {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        datetime scheduled_at
        string status
    }
    DIAGNOSIS {
        uuid id PK
        uuid appointment_id FK
        string icd_code
        text notes
    }
    PATIENT ||--o{ APPOINTMENT : "has"
    DOCTOR  ||--o{ APPOINTMENT : "conducts"
    APPOINTMENT ||--o| DIAGNOSIS : "results in"`,

  Gantt: `gantt
    title Patient Recovery Timeline
    dateFormat  YYYY-MM-DD
    section Pre-Op
    Consultation        :done,    a1, 2024-01-01, 2d
    Pre-op Tests        :done,    a2, after a1, 3d
    section Surgery
    Operation           :active,  b1, 2024-01-06, 1d
    section Recovery
    ICU Monitoring      :         c1, after b1, 3d
    General Ward        :         c2, after c1, 5d
    Physiotherapy       :         c3, after c2, 7d
    Discharge           :milestone, c4, after c3, 0d`,

  Pie: `pie title Diagnosis Distribution
    "Cardiovascular" : 30
    "Respiratory"    : 22
    "Neurological"   : 18
    "Orthopedic"     : 15
    "Gastrointestinal": 10
    "Other"          : 5`,
}

const MERMAID_THEMES = ['default', 'forest', 'dark', 'neutral', 'base']

// ── Main Component ────────────────────────────────────────────────────────────
export default function DiagramPage({ onOpenSidebar }) {
  const [code, setCode]           = useState(TEMPLATES['Flowchart'])
  const [svg, setSvg]             = useState('')
  const [parseError, setParseError] = useState(null)
  const [prompt, setPrompt]       = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiError, setAiError]     = useState(null)
  const [copied, setCopied]       = useState(false)
  const [theme, setTheme]         = useState('default')
  const [themeOpen, setThemeOpen] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState('Flowchart')
  const renderIdRef = useRef(0)
  const themeRef    = useRef(null)

  // ── Render mermaid whenever code or theme changes ──────────────────────────
  const renderDiagram = useCallback(async (src, selectedTheme) => {
    if (!src.trim()) { setSvg(''); setParseError(null); return }
    const id = ++renderIdRef.current
    try {
      mermaid.initialize({ startOnLoad: false, theme: selectedTheme, securityLevel: 'loose' })
      const { svg: rendered } = await mermaid.render(`mermaid-diagram-${id}`, src)
      if (renderIdRef.current === id) {
        setSvg(rendered)
        setParseError(null)
      }
    } catch (err) {
      if (renderIdRef.current === id) {
        setParseError(err.message || 'Invalid Mermaid syntax')
        setSvg('')
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => renderDiagram(code, theme), 300)
    return () => clearTimeout(timer)
  }, [code, theme, renderDiagram])

  // Close theme dropdown on outside click
  useEffect(() => {
    if (!themeOpen) return
    const handler = e => { if (!themeRef.current?.contains(e.target)) setThemeOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [themeOpen])

  // ── AI generation ──────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setAiError(null)
    try {
      const { data } = await generateDiagram(prompt.trim(), code)
      setCode(data.mermaid_code)
      setActiveTemplate(null)
    } catch (err) {
      setAiError(err.response?.data?.detail || 'Generation failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Template picker ────────────────────────────────────────────────────────
  const applyTemplate = name => {
    setCode(TEMPLATES[name])
    setActiveTemplate(name)
    setAiError(null)
  }

  // ── Copy code ──────────────────────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Export SVG ────────────────────────────────────────────────────────────
  const handleExportSVG = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'diagram.svg'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export PNG ────────────────────────────────────────────────────────────
  const handleExportPNG = () => {
    if (!svg) return
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url     = URL.createObjectURL(svgBlob)
    const img     = new Image()
    img.onload = () => {
      const canvas  = document.createElement('canvas')
      const scale   = 2  // retina
      canvas.width  = img.width  * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = 'diagram.png'
      a.click()
    }
    img.src = url
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-zinc-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenSidebar}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 transition shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
              <GitFork className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Diagram Editor</h1>
              <p className="text-sm text-zinc-400">Generate and edit Mermaid diagrams with AI</p>
            </div>
          </div>

          {/* Export & theme controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme picker */}
            <div className="relative hidden sm:block" ref={themeRef}>
              <button
                onClick={() => setThemeOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition"
              >
                <span className="capitalize">{theme}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {themeOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 min-w-[130px]">
                  {MERMAID_THEMES.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); setThemeOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-zinc-50 transition ${t === theme ? 'text-violet-600 font-medium' : 'text-zinc-700'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              onClick={handleExportSVG}
              disabled={!svg}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-40 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">SVG</span>
            </button>

            <button
              onClick={handleExportPNG}
              disabled={!svg}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PNG</span>
            </button>
          </div>
        </div>

        {/* ── AI Prompt Bar ──────────────────────────────────────────────── */}
        <div className="mt-4 flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition">
            <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleGenerate()}
              placeholder="Describe a diagram — e.g. 'Patient admission flowchart with ICU branch'…"
              className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none"
              disabled={generating}
            />
            {prompt && (
              <button onClick={() => setPrompt('')} className="shrink-0 text-zinc-400 hover:text-zinc-600 transition">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-medium rounded-xl transition"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4" /> Generate</>
            }
          </button>
        </div>

        {aiError && (
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {aiError}
          </p>
        )}

        {/* ── Template buttons ───────────────────────────────────────────── */}
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-zinc-400 shrink-0">Templates:</span>
          {Object.keys(TEMPLATES).map(name => (
            <button
              key={name}
              onClick={() => applyTemplate(name)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                activeTemplate === name
                  ? 'bg-violet-100 text-violet-700 border border-violet-200'
                  : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:bg-zinc-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Split Pane ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* Code Editor */}
        <div className="lg:w-[45%] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-100 min-h-0">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 border-b border-zinc-100">
            <span className="text-xs font-medium text-zinc-500">Mermaid Code</span>
            <span className="text-xs text-zinc-400">{code.split('\n').length} lines</span>
          </div>
          <textarea
            value={code}
            onChange={e => { setCode(e.target.value); setActiveTemplate(null) }}
            spellCheck={false}
            className="flex-1 resize-none p-4 font-mono text-sm text-zinc-800 bg-white outline-none leading-relaxed min-h-[200px] lg:min-h-0"
            placeholder="Enter Mermaid diagram code here…"
          />
          {parseError && (
            <div className="shrink-0 flex items-start gap-2 px-4 py-2.5 bg-red-50 border-t border-red-100 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-all">{parseError}</span>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 border-b border-zinc-100">
            <span className="text-xs font-medium text-zinc-500">Live Preview</span>
            {svg && <span className="text-xs text-green-600 font-medium">✓ Valid</span>}
          </div>
          <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-white min-h-[200px]">
            {svg ? (
              <div
                className="max-w-full [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : parseError ? (
              <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
                <AlertCircle className="w-10 h-10 text-red-200" />
                <p className="text-sm text-zinc-400">Fix the syntax error to see the preview</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
                <GitFork className="w-10 h-10 text-zinc-200" />
                <p className="text-sm text-zinc-400">Your diagram will appear here</p>
                <p className="text-xs text-zinc-300">Use a template or describe a diagram with AI</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
