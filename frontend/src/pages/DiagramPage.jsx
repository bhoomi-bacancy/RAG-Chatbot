import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import mermaid from 'mermaid'
import {
  GitFork, Sparkles, Copy, Download, Check, Loader2,
  AlertCircle, Menu, ChevronDown, RotateCcw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { generateDiagram } from '../api/client'

// ── Mermaid init ──────────────────────────────────────────────────────────────
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
})

// ── Templates ─────────────────────────────────────────────────────────────────
function getTemplates(t) {
  return {
    Flowchart: `graph TD
    A([${t('diagram.tplcPatientArrives')}]) --> B[${t('diagram.tplcRegistration')}]
    B --> C[${t('diagram.tplcTriage')}]
    C --> D{${t('diagram.tplcSeverity')}}
    D -->|${t('diagram.tplcCritical')}| E[${t('diagram.tplcEmergency')}]
    D -->|${t('diagram.tplcModerate')}| F[${t('diagram.tplcUrgent')}]
    D -->|${t('diagram.tplcMinor')}| G[${t('diagram.tplcOPD')}]
    E --> H[${t('diagram.tplcTreatment')}]
    F --> H
    G --> H
    H --> I{${t('diagram.tplcAdmitted')}}
    I -->|${t('diagram.tplcYes')}| J[${t('diagram.tplcWard')}]
    I -->|${t('diagram.tplcNo')}| K([${t('diagram.tplcDischarge')}])
    J --> K`,

    Sequence: `sequenceDiagram
    participant P as ${t('diagram.tplcPatient')}
    participant D as ${t('diagram.tplcDoctor')}
    participant L as ${t('diagram.tplcLaboratory')}
    participant Ph as ${t('diagram.tplcPharmacy')}

    P->>D: ${t('diagram.tplcBookAppt')}
    D->>P: ${t('diagram.tplcConductExam')}
    D->>L: ${t('diagram.tplcOrderTests')}
    L-->>D: ${t('diagram.tplcReturnResults')}
    D->>D: ${t('diagram.tplcAnalyzeResults')}
    D->>P: ${t('diagram.tplcShareDiagnosis')}
    D->>Ph: ${t('diagram.tplcSendPrescription')}
    Ph-->>P: ${t('diagram.tplcDispenseMed')}`,

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
    title ${t('diagram.tplcGanttTitle')}
    dateFormat  YYYY-MM-DD
    section ${t('diagram.tplcPreOp')}
    ${t('diagram.tplcConsultation')}        :done,    a1, 2024-01-01, 2d
    ${t('diagram.tplcPreOpTests')}        :done,    a2, after a1, 3d
    section ${t('diagram.tplcSurgery')}
    ${t('diagram.tplcOperation')}           :active,  b1, 2024-01-06, 1d
    section ${t('diagram.tplcRecovery')}
    ${t('diagram.tplcICUMonitoring')}      :         c1, after b1, 3d
    ${t('diagram.tplcGeneralWard')}        :         c2, after c1, 5d
    ${t('diagram.tplcPhysiotherapy')}       :         c3, after c2, 7d
    ${t('diagram.tplcDischarge')}           :milestone, c4, after c3, 0d`,

    Pie: `pie title ${t('diagram.tplcPieTitle')}
    "${t('diagram.tplcCardio')}" : 30
    "${t('diagram.tplcRespiratory')}"    : 22
    "${t('diagram.tplcNeuro')}"   : 18
    "${t('diagram.tplcOrtho')}"     : 15
    "${t('diagram.tplcGastro')}": 10
    "${t('diagram.tplcOther')}"          : 5`,
  }
}

const MERMAID_THEMES = ['default', 'forest', 'dark', 'neutral', 'base']

const TEMPLATE_T_KEYS = {
  'Flowchart':    'diagram.tplFlowchart',
  'Sequence':     'diagram.tplSequence',
  'Class Diagram':'diagram.tplClass',
  'ER Diagram':   'diagram.tplER',
  'Gantt':        'diagram.tplGantt',
  'Pie':          'diagram.tplPie',
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DiagramPage({ onOpenSidebar }) {
  const { t } = useTranslation()
  const templates = useMemo(() => getTemplates(t), [t])
  const [code, setCode]           = useState(() => getTemplates(t)['Flowchart'])
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

  // Update active template code when language changes
  useEffect(() => {
    if (activeTemplate) {
      setCode(templates[activeTemplate])
    }
  }, [templates, activeTemplate])

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
      setAiError(err.response?.data?.detail || t('diagram.generateError'))
    } finally {
      setGenerating(false)
    }
  }

  // ── Template picker ────────────────────────────────────────────────────────
  const applyTemplate = name => {
    setCode(templates[name])
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
    <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 min-h-0 overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenSidebar}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
              <GitFork className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('diagram.title')}</h1>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">{t('diagram.subtitle')}</p>
            </div>
          </div>

          {/* Export & theme controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme picker */}
            <div className="relative hidden sm:block" ref={themeRef}>
              <button
                onClick={() => setThemeOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
              >
                <span className="capitalize">{theme}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {themeOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg py-1 min-w-[130px]">
                  {MERMAID_THEMES.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); setThemeOpen(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-zinc-50 dark:hover:bg-zinc-800 transition ${t === theme ? 'text-orange-500 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? t('diagram.copied') : t('diagram.copy')}</span>
            </button>

            <button
              onClick={handleExportSVG}
              disabled={!svg}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">SVG</span>
            </button>

            <button
              onClick={handleExportPNG}
              disabled={!svg}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-40 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PNG</span>
            </button>
          </div>
        </div>

        {/* ── AI Prompt Bar ──────────────────────────────────────────────── */}
        <div className="mt-4 flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 dark:focus-within:ring-orange-900/40 transition">
            <Sparkles className="w-4 h-4 text-orange-500 shrink-0" />
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleGenerate()}
              placeholder={t('diagram.placeholder')}
              className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none"
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
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium rounded-xl transition"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('diagram.generating')}</>
              : <><Sparkles className="w-4 h-4" /> {t('diagram.generate')}</>
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
          <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">{t('diagram.templates')}</span>
          {Object.keys(TEMPLATE_T_KEYS).map(name => (
            <button
              key={name}
              onClick={() => applyTemplate(name)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                activeTemplate === name
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {t(TEMPLATE_T_KEYS[name] || name)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Split Pane ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* Code Editor */}
        <div className="lg:w-[45%] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-100 dark:border-zinc-800 min-h-0">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('diagram.mermaidCode')}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{t('diagram.lines', { count: code.split('\n').length })}</span>
          </div>
          <textarea
            value={code}
            onChange={e => { setCode(e.target.value); setActiveTemplate(null) }}
            spellCheck={false}
            className="flex-1 resize-none p-4 font-mono text-sm text-zinc-800 dark:text-zinc-100 bg-white dark:bg-zinc-950 outline-none leading-relaxed min-h-[200px] lg:min-h-0"
            placeholder={t('diagram.codePlaceholder')}
          />
          {parseError && (
            <div className="shrink-0 flex items-start gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border-t border-red-100 dark:border-red-900/40 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-all">{parseError}</span>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t('diagram.livePreview')}</span>
            {svg && <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t('diagram.valid')}</span>}
          </div>
          <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-white dark:bg-zinc-950 min-h-[200px]">
            {svg ? (
              <div
                className="max-w-full [&_svg]:max-w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : parseError ? (
              <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
                <AlertCircle className="w-10 h-10 text-red-200" />
                <p className="text-sm text-zinc-400">{t('diagram.fixSyntax')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
                <GitFork className="w-10 h-10 text-zinc-200" />
                <p className="text-sm text-zinc-400">{t('diagram.emptyTitle')}</p>
                <p className="text-xs text-zinc-300">{t('diagram.emptyHint')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
