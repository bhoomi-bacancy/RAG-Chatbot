import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2 } from 'lucide-react'
import { uploadDocument } from '../api/client'

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
}

export default function UploadZone({ onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const onDrop = useCallback(
    async accepted => {
      if (!accepted.length) return
      const file = accepted[0]
      setUploading(true)
      setProgress(0)
      setError('')
      try {
        const { data } = await uploadDocument(file, setProgress)
        onUploaded(data)
      } catch (err) {
        setError(err.response?.data?.detail || 'Upload failed. Please try again.')
      } finally {
        setUploading(false)
        setProgress(0)
      }
    },
    [onUploaded],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div className="p-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-medical-400 bg-medical-50' : 'border-slate-600 hover:border-medical-400 hover:bg-slate-700'}
          ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-7 h-7 text-medical-400 animate-spin" />
            <p className="text-sm text-slate-300">Uploading… {progress}%</p>
            <div className="w-full bg-slate-600 rounded-full h-1.5 mt-1">
              <div
                className="bg-medical-400 h-1.5 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className={`w-7 h-7 ${isDragActive ? 'text-medical-400' : 'text-slate-400'}`} />
            <p className="text-sm text-slate-300 font-medium">
              {isDragActive ? 'Drop to upload' : 'Drop file or click to browse'}
            </p>
            <p className="text-xs text-slate-500">PDF · DOCX · TXT · up to 50 MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400 text-center px-1">{error}</p>
      )}
    </div>
  )
}
