import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2 } from 'lucide-react'
import { uploadDocument } from '../api/client'

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
}

export default function UploadZone({ onUploaded, dark = false }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState('')

  const onDrop = useCallback(async accepted => {
    if (!accepted.length) return
    setUploading(true)
    setProgress(0)
    setError('')
    try {
      const { data } = await uploadDocument(accepted[0], setProgress)
      onUploaded(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [onUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: uploading,
  })

  const zoneClass = dark
    ? isDragActive
      ? 'border-orange-500 bg-zinc-800'
      : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800'
    : isDragActive
      ? 'border-orange-400 bg-orange-50'
      : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
          ${zoneClass} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className={`w-5 h-5 animate-spin ${dark ? 'text-orange-400' : 'text-orange-500'}`} />
            <p className={`text-xs font-medium ${dark ? 'text-zinc-300' : 'text-gray-600'}`}>
              Uploading… {progress}%
            </p>
            <div className={`w-full rounded-full h-1 ${dark ? 'bg-zinc-700' : 'bg-gray-200'}`}>
              <div
                className="bg-orange-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className={`w-5 h-5 ${dark
              ? isDragActive ? 'text-orange-400' : 'text-zinc-500'
              : isDragActive ? 'text-orange-500' : 'text-gray-400'
            }`} />
            <p className={`text-xs font-medium ${dark ? 'text-zinc-400' : 'text-gray-600'}`}>
              {isDragActive ? 'Drop to upload' : 'Click or drag & drop'}
            </p>
            <p className={`text-xs ${dark ? 'text-zinc-600' : 'text-gray-400'}`}>
              PDF · DOCX · TXT
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className={`mt-2 text-xs text-center ${dark ? 'text-red-400' : 'text-red-500'}`}>{error}</p>
      )}
    </div>
  )
}
