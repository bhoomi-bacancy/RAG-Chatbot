import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AuthPage from './pages/AuthPage'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'

function AppShell() {
  const { user, loading } = useAuth()
  const [currentChatId, setCurrentChatId] = useState(null)
  const [renderKey, setRenderKey] = useState('new')   // controls ChatWindow remount
  const [chats, setChats] = useState([])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <AuthPage />

  // Explicit chat switch (sidebar click or new-chat button) → remount ChatWindow
  const selectChat = id => { setCurrentChatId(id); setRenderKey(id ?? 'new') }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        currentChatId={currentChatId}
        chats={chats}
        setChats={setChats}
        onSelectChat={selectChat}
        onNewChat={selectChat}
      />
      <ChatWindow
        chatId={currentChatId}
        key={renderKey}
        onChatCreated={id => setCurrentChatId(id)}   // only update id, don't remount
        chats={chats}
        setChats={setChats}
      />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
