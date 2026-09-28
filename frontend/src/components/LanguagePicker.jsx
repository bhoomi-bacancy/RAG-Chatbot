import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { LANGUAGES } from '../i18n'
import { useAuth } from '../contexts/AuthContext'

export default function LanguagePicker() {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = code => {
    i18n.changeLanguage(code)
    const key = user?.id ? `lang_${user.id}` : 'lang'
    localStorage.setItem(key, code)
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr'
    setOpen(false)
  }

  // Set initial RTL direction
  useEffect(() => {
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr'
  }, [i18n.language])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Change language"
        className="flex items-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
      >
        <Globe className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{current.flag} {current.label}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => select(lang.code)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition ${
                lang.code === i18n.language
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
