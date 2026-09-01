import { useEffect, useState } from 'react'
import {
  Activity,
  FileText,
  File,
  AlignLeft,
  Trash2,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react'
import UploadZone from './UploadZone'
import { listDocuments, deleteDocument } from '../api/client'

const FILE_ICONS = {
  '.pdf': FileText,
  '.docx': File,
  '.doc': File,
  '.txt': AlignLeft,
}

function ConfidenceBadge({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 75 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-xs font-semibold ${color}`}>{pct}%</span>
}

export default function Sidebar({ selectedDocIds, onSelectionChange, onDocumentsChange }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchDocs = async () => {
    setLoading(true)
    try {
      const { data } = await listDocuments()
      setDocuments(data)
      onDocumentsChange(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDocs() }, [])

  const handleUploaded = doc => {
    fetchDocs()
  }

  const handleDelete = async id => {
    await deleteDocument(id)
    const updated = documents.filter(d => d.id !== id)
    setDocuments(updated)
    onDocumentsChange(updated)
    onSelectionChange(prev => prev.filter(x => x !== id))
  }

  const toggleSelect = id => {
    onSelectionChange(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <aside className="w-72 bg-slate-800 flex flex-col border-r border-slate-700 shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-medical-500 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">MedAssist</h1>
            <p className="text-slate-400 text-xs">RAG Medical Chatbot</p>
          </div>
        </div>
      </div>

      {/* Upload */}
      <div className="border-b border-slate-700">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 pt-4 pb-2">
          Upload Document
        </p>
        <UploadZone onUploaded={handleUploaded} />
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Documents ({documents.length})
          </p>
          <button
            onClick={fetchDocs}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {documents.length === 0 ? (
          <p className="text-slate-500 text-xs text-center px-4 py-6 leading-relaxed">
            No documents yet.<br />Upload a PDF, DOCX, or TXT file to get started.
          </p>
        ) : (
          <ul className="space-y-1 px-2 pb-4">
            {documents.map(doc => {
              const Icon = FILE_ICONS[doc.file_type] || FileText
              const isSelected = selectedDocIds.includes(doc.id)
              return (
                <li
                  key={doc.id}
                  className={`rounded-lg px-2 py-2.5 group transition-colors cursor-pointer
                    ${isSelected ? 'bg-medical-900/60 border border-medical-700' : 'hover:bg-slate-700'}`}
                  onClick={() => toggleSelect(doc.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-medical-400" />
                        : <Square className="w-4 h-4 text-slate-500 group-hover:text-slate-400" />
                      }
                    </div>
                    <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-200 font-medium truncate">{doc.filename}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{doc.chunk_count} chunks</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(doc.id) }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Filter notice */}
      {selectedDocIds.length > 0 && (
        <div className="border-t border-slate-700 px-4 py-3">
          <p className="text-xs text-medical-300 text-center">
            Searching {selectedDocIds.length} selected doc{selectedDocIds.length > 1 ? 's' : ''}
          </p>
          <button
            onClick={() => onSelectionChange([])}
            className="w-full mt-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear filter → search all
          </button>
        </div>
      )}
    </aside>
  )
}
