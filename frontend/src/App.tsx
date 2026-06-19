import { HashRouter, Route, Routes } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import BootScreen from './components/BootScreen'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Alerts from './pages/Alerts'
import Logs from './pages/Logs'
import Devices from './pages/Devices'
import Tools from './pages/Tools'
import IPhoneControl from './pages/IPhoneControl'
import ObsOverlay from './pages/ObsOverlay'
import AdvancedFeatures from './pages/AdvancedFeatures'
import YouTubeMusic from './pages/YouTubeMusic'
import Help from './pages/Help'
import CodeReview from './pages/CodeReview'
import BrainGraph from './pages/BrainGraph'
import ThreatMatrix from './pages/ThreatMatrix'
import IntelFeed from './pages/IntelFeed'

import BrainPage from './pages/Brain'
import WhatsAppPage from './pages/WhatsApp'
import GitLab from './pages/GitLab'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'
import CommandDeck from './pages/CommandDeck'
import WarRoom from './pages/WarRoom'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { JarvisStateProvider } from './contexts/JarvisStateContext'
import { ToastProvider } from './components/Toasts'
import { apiFetch } from './lib/api'
import { setSoundEnabled } from './lib/sounds'
import { setTextSize } from './lib/textScale'

export default function App() {
  // Skip boot screen for OBS overlay (separate tiny window)
  const isOverlay = window.location.hash.includes('obs-overlay')
  const [booted, setBooted] = useState(isOverlay)

  useEffect(() => {
    apiFetch('/api/settings')
      .then(res => res.json())
      // GET /api/settings returns { settings, status } — the prefs are nested.
      .then(data => {
        const s = data.settings ?? data
        setSoundEnabled(s.ui_sound_effects ?? true)
        setTextSize(s.text_size ?? 'default')
      })
      .catch(() => {})
  }, [])

  return (
    <WebSocketProvider>
      <JarvisStateProvider>
        <ToastProvider>
          {!booted && <BootScreen onDone={() => setBooted(true)} />}
          <HashRouter>
            <Routes>
              <Route path="/obs-overlay" element={<ObsOverlay />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="chat" element={<Chat />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="logs" element={<Logs />} />
                <Route path="devices" element={<Devices />} />
                <Route path="tools" element={<Tools />} />
                <Route path="phone" element={<IPhoneControl />} />
                <Route path="advanced" element={<AdvancedFeatures />} />
                <Route path="music" element={<YouTubeMusic />} />
                <Route path="help" element={<Help />} />
                <Route path="code" element={<CodeReview />} />
                <Route path="brain-graph" element={<BrainGraph />} />
                <Route path="threat" element={<ThreatMatrix />} />
                <Route path="intel" element={<IntelFeed />} />
                <Route path="brain" element={<BrainPage />} />
                <Route path="whatsapp" element={<WhatsAppPage />} />
                <Route path="gitlab" element={<GitLab />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="settings" element={<Settings />} />
                <Route path="deck" element={<CommandDeck />} />
                <Route path="warroom" element={<WarRoom />} />
              </Route>
            </Routes>
          </HashRouter>
        </ToastProvider>
      </JarvisStateProvider>
    </WebSocketProvider>
  )
}
