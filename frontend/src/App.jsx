import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'

export default function App() {
  const [documents, setDocuments] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState([])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        selectedDocIds={selectedDocIds}
        onSelectionChange={setSelectedDocIds}
        onDocumentsChange={setDocuments}
      />
      <ChatWindow
        selectedDocIds={selectedDocIds}
        hasDocuments={documents.length > 0}
      />
    </div>
  )
}
