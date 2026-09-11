import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { LinkedInCallback } from 'react-linkedin-login-oauth2'
import './index.css'
import './i18n'
import App from './App.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

// LinkedIn OAuth callback — must render LinkedInCallback at /linkedin
if (window.location.pathname === '/linkedin') {
  createRoot(document.getElementById('root')).render(
    <StrictMode><LinkedInCallback /></StrictMode>
  )
} else {
  const tree = GOOGLE_CLIENT_ID
    ? <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}><App /></GoogleOAuthProvider>
    : <App />

  createRoot(document.getElementById('root')).render(
    <StrictMode>{tree}</StrictMode>
  )
}
