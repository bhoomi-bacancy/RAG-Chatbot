import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, FileText, Trash2, CheckCircle, XCircle,
  Loader2, AlertCircle, X, FolderOpen, File,
} from 'lucide-react'
import { listDocuments, uploadDocument, deleteDocument } from '../api/client'

const MAX_FILE_SIZE = 4 * 1024 * 1024  // 4 MB

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fileTypeStyle(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase()
  if (ext === 'pdf') return { bg: 'bg-red-50', icon: 'text-red-500', border: 'border-red-100', label: 'PDF' }
  if (['docx', 'doc'].includes(ext)) return { bg: 'bg-blue-50', icon: 'text-blue-500', border: 'border-blue-100', label: ext.toUpperCase() }
  if (['png', 'jpg', 'jpeg'].includes(ext)) return { bg: 'bg-purple-50', icon: 'text-purple-500', border: 'border-purple-100', label: 'Image' }
  return { bg: 'bg-zinc-100', icon: 'text-zinc-500', border: 'border-zinc-200', label: ext.toUpperCase() }
}

function StatusChip({ status, progress }) {
  if (status === 'queued')
    return <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">Queued</span>
  if (status === 'uploading')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        {progress}%
      </span>
    )
  if (status === 'done')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium flex items-center gap-1">
        <CheckCircle className="w-3 h-3" /> Done
      </span>
    )
  if (status === 'skipped')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> Duplicate
      </span>
    )
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium flex items-center gap-1">
      <XCircle className="w-3 h-3" /> Error
    </span>
  )
}

export default function DocumentsPage() {
  const [queuedFiles, setQueuedFiles] = useState([])   // {id, file, name, status, progress, error, result}
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const fetchDocs = useCallback(() => {
    setLoadingDocs(true)
    listDocuments()
      .then(({ data }) => setDocuments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingDocs(false))
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const onDrop = useCallback(accepted => {
    const valid = accepted.filter(f => {
      if (f.size > MAX_FILE_SIZE) {
        alert(`"${f.name}" is too large. Maximum file size is 4 MB.`)
        return false
      }
      return true
    })
    setQueuedFiles(prev => [
      ...prev,
      ...valid.slice(0, 10 - prev.length).map(f => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        name: f.name,
        status: 'queued',
        progress: 0,
        error: null,
        result: null,
      })),
    ].slice(0, 10))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    multiple: true,
    disabled: uploading,
    maxFiles: 10,
  })

  const removeQueued = id => setQueuedFiles(prev => prev.filter(f => f.id !== id))

  const handleUploadAll = async () => {
    const pending = queuedFiles.filter(f => f.status === 'queued')
    if (!pending.length) return
    setUploading(true)

    for (const item of pending) {
      setQueuedFiles(prev =>
        prev.map(f => f.id === item.id ? { ...f, status: 'uploading', progress: 0 } : f)
      )
      try {
        const { data } = await uploadDocument(item.file, null, pct => {
          setQueuedFiles(prev =>
            prev.map(f => f.id === item.id ? { ...f, progress: pct } : f)
          )
        })
        setQueuedFiles(prev =>
          prev.map(f => f.id === item.id ? { ...f, status: 'done', progress: 100, result: data } : f)
        )
      } catch (err) {
        const msg = err.response?.data?.detail || 'Upload failed'
        const isDupe = msg.toLowerCase().includes('already exists')
        setQueuedFiles(prev =>
          prev.map(f => f.id === item.id ? { ...f, status: isDupe ? 'skipped' : 'error', error: msg } : f)
        )
      }
    }

    setUploading(false)
    fetchDocs()
  }

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`Delete "${filename}"? This will remove all its chunks from the knowledge base.`)) return
    setDeletingId(docId)
    try {
      await deleteDocument(docId)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch {
      alert('Failed to delete document. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const pendingCount = queuedFiles.filter(f => f.status === 'queued').length
  const doneCount = queuedFiles.filter(f => f.status === 'done').length

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-6 border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Documents</h1>
            <p className="text-sm text-zinc-400">Upload and manage your knowledge base</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0">
        {/* ── Left: Upload panel ── */}
        <div className="lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-100 flex flex-col p-6 gap-4">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
            <Upload className="w-4 h-4 text-orange-500" />
            Upload Documents
          </h2>

          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${uploading ? 'pointer-events-none opacity-60' : ''}
              ${isDragActive
                ? 'border-orange-400 bg-orange-50'
                : 'border-zinc-200 hover:border-orange-300 hover:bg-orange-50/40'
              }`}
          >
            <input {...getInputProps()} />
            <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragActive ? 'text-orange-500' : 'text-zinc-300'}`} />
            <p className="text-sm font-medium text-zinc-600">
              {isDragActive ? 'Drop files here' : 'Click or drag & drop'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">PDF · DOCX · TXT · PNG · JPG — max 4 MB each, up to 10 files</p>
          </div>

          {/* Queued files list */}
          {queuedFiles.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-500">
                  {doneCount}/{queuedFiles.length} uploaded
                </p>
                {queuedFiles.some(f => ['done', 'error', 'skipped'].includes(f.status)) && (
                  <button
                    onClick={() => setQueuedFiles(prev => prev.filter(f => f.status === 'queued'))}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition"
                  >
                    Clear completed
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                {queuedFiles.map(item => {
                  const { icon } = fileTypeStyle(item.name)
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2"
                    >
                      <File className={`w-4 h-4 shrink-0 ${icon}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-800 truncate">{item.name}</p>
                        <p className="text-[11px] text-zinc-400">{formatBytes(item.file.size)}</p>
                        {item.error && item.status === 'error' && (
                          <p className="text-[11px] text-red-500 truncate">{item.error}</p>
                        )}
                        {item.status === 'uploading' && (
                          <div className="w-full bg-zinc-200 rounded-full h-0.5 mt-1">
                            <div
                              className="bg-orange-500 h-0.5 rounded-full transition-all"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <StatusChip status={item.status} progress={item.progress} />
                      {item.status === 'queued' && (
                        <button
                          onClick={() => removeQueued(item.id)}
                          className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-200 hover:bg-zinc-300 text-zinc-500 transition"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                      {item.result?.duplicates_removed > 0 && (
                        <span className="shrink-0 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          {item.result.duplicates_removed} dupes removed
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {pendingCount > 0 && (
                <button
                  onClick={handleUploadAll}
                  disabled={uploading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Upload {pendingCount} file{pendingCount > 1 ? 's' : ''}</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Info box */}
          <div className="mt-auto rounded-xl bg-zinc-50 border border-zinc-100 p-4">
            <p className="text-xs font-medium text-zinc-600 mb-1">How it works</p>
            <ul className="text-xs text-zinc-400 space-y-1 leading-relaxed">
              <li>• Text is extracted (OCR for scanned / image pages)</li>
              <li>• Duplicate content is automatically removed</li>
              <li>• Chunks are indexed for semantic search</li>
              <li>• Attach documents to a chat to answer questions from them</li>
            </ul>
          </div>
        </div>

        {/* ── Right: Document library ── */}
        <div className="flex-1 flex flex-col p-6 min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Your Documents
              {documents.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-xs font-medium">
                  {documents.length}
                </span>
              )}
            </h2>
            {documents.length > 0 && (
              <button
                onClick={fetchDocs}
                className="text-xs text-zinc-400 hover:text-zinc-600 transition"
              >
                Refresh
              </button>
            )}
          </div>

          {loadingDocs ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <FileText className="w-10 h-10 text-zinc-200" />
              <p className="text-sm text-zinc-400">No documents yet.</p>
              <p className="text-xs text-zinc-300">Upload your first document to get started.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-2">
                {documents.map(doc => {
                  const { bg, icon, border, label } = fileTypeStyle(doc.filename)
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 bg-white border border-zinc-100 rounded-xl px-4 py-3 hover:border-zinc-200 hover:shadow-sm transition-all group"
                    >
                      <div className={`shrink-0 w-9 h-9 ${bg} border ${border} rounded-lg flex items-center justify-center`}>
                        <FileText className={`w-4.5 h-4.5 ${icon}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 truncate">{doc.filename}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${bg} ${icon}`}>
                            {label}
                          </span>
                          <span className="text-[11px] text-zinc-400">{doc.chunk_count} chunks</span>
                          <span className="text-[11px] text-zinc-300">·</span>
                          <span className="text-[11px] text-zinc-400">{formatDate(doc.uploaded_at)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        disabled={deletingId === doc.id}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                        title="Delete document"
                      >
                        {deletingId === doc.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
