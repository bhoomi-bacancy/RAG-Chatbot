import { createContext, useContext, useEffect, useState } from 'react'
import { getMe, logout as apiLogout } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('inkira_token')
    if (!token) {
      setLoading(false)
      return
    }
    getMe()
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem('inkira_token')
        localStorage.removeItem('inkira_user')
      })
      .finally(() => setLoading(false))
  }, [])

  // Also handle auth expiry signal set by the axios interceptor
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.__authExpired) {
        window.__authExpired = false
        apiLogout()
        setUser(null)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const login = (token, userData) => {
    localStorage.setItem('inkira_token', token)
    localStorage.setItem('inkira_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    apiLogout()
    setUser(null)
  }

  const updateUser = updates => setUser(prev => ({ ...prev, ...updates }))

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
