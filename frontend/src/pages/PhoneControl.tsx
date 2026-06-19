import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Smartphone, RefreshCw, Home, ArrowLeft, Square, Volume2, VolumeX,
  ZoomIn, ZoomOut, Power, Wifi, MonitorSmartphone, Send, Play
} from 'lucide-react'
import clsx from 'clsx'

interface PhoneInfo {
  output: string
}

interface Device {
  serial: string
  name: string
}

const GESTURE_BUTTONS = [
  { id: 'back', icon: ArrowLeft, label: 'Back', keycode: 'KEYCODE_BACK' },
  { id: 'home', icon: Home, label: 'Home', keycode: 'KEYCODE_HOME' },
  { id: 'recents', icon: Square, label: 'Recents', keycode: 'KEYCODE_APP_SWITCH' },
  { id: 'power', icon: Power, label: 'Power', keycode: 'KEYCODE_POWER' },
  { id: 'vol_up', icon: Volume2, label: 'Vol +', keycode: 'KEYCODE_VOLUME_UP' },
  { id: 'vol_down', icon: VolumeX, label: 'Vol -', keycode: 'KEYCODE_VOLUME_DOWN' },
]

const QUICK_APPS = [
  { label: 'WhatsApp', pkg: 'com.whatsapp' },
  { label: 'Chrome', pkg: 'com.android.chrome' },
  { label: 'Camera', pkg: 'com.android.camera2' },
  { label: 'Settings', pkg: 'com.android.settings' },
  { label: 'Spotify', pkg: 'com.spotify.music' },
  { label: 'Maps', pkg: 'com.google.android.apps.maps' },
  { label: 'Gmail', pkg: 'com.google.android.gm' },
  { label: 'YouTube', pkg: 'com.google.android.youtube' },
]

export default function PhoneControl() {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [phoneInfo, setPhoneInfo] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [mirrorActive, setMirrorActive] = useState(false)
  const [typeText, setTypeText] = useState('')
  const [customPkg, setCustomPkg] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState('')
  const [wirelessIp, setWirelessIp] = useState('')
  const mirrorIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const screenRef = useRef<HTMLImageElement>(null)

  const serial = selectedDevice || undefined
  const qp = serial ? `?serial=${serial}` : ''

  const loadDevices = async () => {
    const data = await fetch('/api/phone/devices').then(r => r.json())
    const lines = (data.output as string).split('\n').filter(l => l.includes('\t') && !l.startsWith('List'))
    const devs = lines.map(l => {
      const parts = l.split('\t')
      return { serial: parts[0].trim(), name: parts[1]?.trim() || 'Android Device' }
    })
    setDevices(devs)
    if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0].serial)
  }

  const loadInfo = async () => {
    const data = await fetch(`/api/phone/info${qp}`).then(r => r.json())
    setPhoneInfo(data.output)
  }

  useEffect(() => { loadDevices() }, [])
  useEffect(() => { if (selectedDevice) loadInfo() }, [selectedDevice])

  const takeScreenshot = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/phone/screenshot${qp}`)
      if (!res.ok) {
        const err = await res.json()
        setStatus(`Screenshot failed: ${err.detail}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setScreenshot(url)
    } catch (e) {
      setStatus(`Error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const startMirror = () => {
    setMirrorActive(true)
    takeScreenshot()
    mirrorIntervalRef.current = setInterval(takeScreenshot, 1500)
  }

  const stopMirror = () => {
    setMirrorActive(false)
    clearInterval(mirrorIntervalRef.current)
  }

  useEffect(() => () => clearInterval(mirrorIntervalRef.current), [])

  const pressKey = async (keycode: string) => {
    const res = await fetch(`/api/phone/key${qp ? qp + '&' : '?'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keycode, serial }),
    }).then(r => r.json())
    setStatus(res.result)
  }

  const gesture = async (name: string) => {
    const res = await fetch(`/api/phone/gesture/${name}${qp}`, { method: 'POST' }).then(r => r.json())
    setStatus(res.result)
  }

  const sendText = async () => {
    if (!typeText.trim()) return
    const res = await fetch('/api/phone/type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: typeText, serial }),
    }).then(r => r.json())
    setStatus(res.result)
    setTypeText('')
  }

  const launchApp = async (pkg: string) => {
    const res = await fetch('/api/phone/launch-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_name: pkg, serial }),
    }).then(r => r.json())
    setStatus(res.result)
  }

  const launchScrcpy = async () => {
    const res = await fetch('/api/phone/scrcpy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, options: '--max-size 1080' }),
    }).then(r => r.json())
    setStatus(res.result)
  }

  const loadNotifications = async () => {
    const data = await fetch(`/api/phone/notifications${qp}`).then(r => r.json())
    setNotifications(data.output)
  }

  const connectWireless = async () => {
    if (!wirelessIp.trim()) return
    const res = await fetch('/api/phone/connect-wireless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: wirelessIp }),
    }).then(r => r.json())
    setStatus(res.result)
    loadDevices()
  }

  const handleScreenTap = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!screenshot || !screenRef.current) return
    const rect = screenRef.current.getBoundingClientRect()
    const ratioX = e.clientX - rect.left
    const ratioY = e.clientY - rect.top
    // Assuming 1080x2400 phone (will work for most modern phones)
    const phoneW = 1080
    const phoneH = 2400
    const x = Math.round((ratioX / rect.width) * phoneW)
    const y = Math.round((ratioY / rect.height) * phoneH)
    fetch('/api/phone/tap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, serial }),
    }).then(r => r.json()).then(d => setStatus(`Tapped (${x}, ${y}): ${d.result}`))
  }, [screenshot, serial])

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text">PHONE CONTROL</h1>
          <p className="text-xs text-jarvis-muted mt-1">Android screen mirroring and remote control via ADB</p>
        </div>
        <button onClick={loadDevices} className="btn-primary flex items-center gap-2">
          <RefreshCw size={11} /> SCAN DEVICES
        </button>
      </div>

      {/* Status bar */}
      {status && (
        <div className="panel p-3 text-xs text-jarvis-glow border-jarvis-glow/20">
          {status}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: Devices + Info + Controls */}
        <div className="space-y-4">
          {/* Device selector */}
          <div className="panel p-4">
            <div className="label-jarvis">CONNECTED DEVICES</div>
            {devices.length === 0 ? (
              <p className="text-xs text-jarvis-muted">No devices detected. Connect via USB or WiFi.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {devices.map(d => (
                  <button
                    key={d.serial}
                    onClick={() => setSelectedDevice(d.serial)}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded border text-xs transition-all',
                      selectedDevice === d.serial
                        ? 'border-jarvis-glow text-jarvis-glow bg-jarvis-glow/5'
                        : 'border-jarvis-border text-jarvis-muted hover:border-jarvis-text'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone size={12} />
                      <span>{d.serial}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Wireless connect */}
            <div className="mt-3 pt-3 border-t border-jarvis-border">
              <div className="label-jarvis">CONNECT VIA WiFi</div>
              <div className="flex gap-2 mt-1">
                <input
                  className="input-jarvis text-xs flex-1"
                  placeholder="Phone IP (e.g. 192.168.1.5)"
                  value={wirelessIp}
                  onChange={e => setWirelessIp(e.target.value)}
                />
                <button onClick={connectWireless} className="btn-primary text-[10px] px-2">
                  <Wifi size={11} />
                </button>
              </div>
              <p className="text-[9px] text-jarvis-muted mt-1">Enable wireless debugging in Developer Options first</p>
            </div>
          </div>

          {/* Phone info */}
          {phoneInfo && (
            <div className="panel p-4">
              <div className="label-jarvis">DEVICE INFO</div>
              <pre className="text-[11px] text-jarvis-text mt-2 whitespace-pre-wrap">{phoneInfo}</pre>
            </div>
          )}

          {/* Hardware buttons */}
          <div className="panel p-4">
            <div className="label-jarvis mb-3">HARDWARE CONTROLS</div>
            <div className="grid grid-cols-3 gap-2">
              {GESTURE_BUTTONS.map(({ id, icon: Icon, label, keycode }) => (
                <button
                  key={id}
                  onClick={() => pressKey(keycode)}
                  className="flex flex-col items-center gap-1 p-2 border border-jarvis-border rounded hover:border-jarvis-glow hover:text-jarvis-glow text-jarvis-muted transition-all"
                >
                  <Icon size={14} />
                  <span className="text-[9px] tracking-wider">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Type text */}
          <div className="panel p-4">
            <div className="label-jarvis mb-2">TYPE ON PHONE</div>
            <div className="flex gap-2">
              <input
                className="input-jarvis flex-1 text-xs"
                placeholder="Text to type..."
                value={typeText}
                onChange={e => setTypeText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendText()}
              />
              <button onClick={sendText} className="btn-primary px-3">
                <Send size={11} />
              </button>
            </div>
          </div>

          {/* Quick apps */}
          <div className="panel p-4">
            <div className="label-jarvis mb-3">QUICK LAUNCH</div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_APPS.map(app => (
                <button
                  key={app.pkg}
                  onClick={() => launchApp(app.pkg)}
                  className="text-[10px] px-2 py-1.5 border border-jarvis-border rounded text-jarvis-muted hover:border-jarvis-accent hover:text-jarvis-accent transition-all tracking-wider text-left"
                >
                  {app.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                className="input-jarvis flex-1 text-xs"
                placeholder="com.example.app"
                value={customPkg}
                onChange={e => setCustomPkg(e.target.value)}
              />
              <button onClick={() => launchApp(customPkg)} className="btn-primary px-3">
                <Play size={11} />
              </button>
            </div>
          </div>
        </div>

        {/* Center + Right: Screen mirror */}
        <div className="lg:col-span-2 space-y-4">
          {/* Mirror controls */}
          <div className="panel p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MonitorSmartphone size={16} className="text-jarvis-glow" />
              <div>
                <div className="text-xs font-semibold text-jarvis-text">SCREEN MIRROR</div>
                <div className="text-[10px] text-jarvis-muted">Click on the screen to tap. Updates every 1.5s.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={takeScreenshot} disabled={loading} className="btn-primary flex items-center gap-1.5 text-[10px]">
                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> SNAP
              </button>
              {mirrorActive ? (
                <button onClick={stopMirror} className="btn-danger text-[10px]">STOP MIRROR</button>
              ) : (
                <button onClick={startMirror} className="btn-success flex items-center gap-1.5 text-[10px]">
                  <Play size={10} /> LIVE MIRROR
                </button>
              )}
              <button onClick={launchScrcpy} className="px-3 py-2 border border-jarvis-accent text-jarvis-accent rounded text-[10px] hover:bg-jarvis-accent/10 transition-all flex items-center gap-1.5">
                <MonitorSmartphone size={10} /> SCRCPY
              </button>
            </div>
          </div>

          {/* Phone screen */}
          <div className="panel p-3 flex justify-center items-start min-h-96">
            {screenshot ? (
              <div className="relative">
                <div className="text-[9px] text-jarvis-muted text-center mb-2 tracking-widest">
                  {mirrorActive ? '● LIVE' : 'SNAPSHOT'} — CLICK TO TAP
                </div>
                {/* Phone frame */}
                <div className="relative bg-black rounded-2xl p-2 border border-jarvis-border shadow-glow-sm"
                     style={{ width: 280 }}>
                  <div className="bg-black rounded-lg overflow-hidden">
                    <img
                      ref={screenRef}
                      src={screenshot}
                      alt="Phone screen"
                      className="w-full cursor-crosshair select-none"
                      style={{ maxHeight: '65vh', objectFit: 'contain' }}
                      onClick={handleScreenTap}
                      draggable={false}
                    />
                  </div>
                  {/* Notch decoration */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-jarvis-border rounded-full opacity-50" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-jarvis-muted space-y-4">
                <Smartphone size={48} className="opacity-20" />
                <div className="text-xs tracking-widest">NO SCREEN SIGNAL</div>
                <div className="text-[10px] opacity-60">Connect a device and click SNAP or LIVE MIRROR</div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="label-jarvis">PHONE NOTIFICATIONS</div>
              <button onClick={loadNotifications} className="text-[10px] text-jarvis-glow hover:text-jarvis-accent">
                REFRESH
              </button>
            </div>
            {notifications ? (
              <pre className="text-[10px] text-jarvis-text whitespace-pre-wrap max-h-40 overflow-y-auto">{notifications}</pre>
            ) : (
              <p className="text-[11px] text-jarvis-muted">Click REFRESH to load notifications.</p>
            )}
          </div>
        </div>
      </div>

      {/* Setup guide */}
      <div className="panel p-5">
        <h3 className="text-xs tracking-widest text-jarvis-muted mb-4">SETUP GUIDE</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <div>
            <div className="text-jarvis-accent font-semibold mb-2">1. Enable Developer Options</div>
            <div className="text-jarvis-muted space-y-1">
              <p>Settings → About Phone</p>
              <p>Tap "Build Number" 7 times</p>
              <p>Go back → Developer Options</p>
              <p>Enable USB Debugging</p>
            </div>
          </div>
          <div>
            <div className="text-jarvis-accent font-semibold mb-2">2. Install ADB</div>
            <code className="text-jarvis-glow text-[10px] block bg-jarvis-bg px-2 py-1.5 rounded">
              winget install Google.PlatformTools
            </code>
            <p className="text-jarvis-muted mt-2">Then restart your terminal and connect phone via USB.</p>
          </div>
          <div>
            <div className="text-jarvis-accent font-semibold mb-2">3. scrcpy (Full Control)</div>
            <code className="text-jarvis-glow text-[10px] block bg-jarvis-bg px-2 py-1.5 rounded">
              winget install Genymobile.scrcpy
            </code>
            <p className="text-jarvis-muted mt-2">Full mouse + keyboard + touch control in a native window.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
