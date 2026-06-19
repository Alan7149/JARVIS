import { apiFetch } from '../lib/api'
import { useEffect, useState, useRef } from 'react'
import { Smartphone, Wifi, Bell, Zap, Share2, Mic, Copy, CheckCircle, ExternalLink, RefreshCw, Send } from 'lucide-react'
import clsx from 'clsx'
import { useWebSocket } from '../contexts/WebSocketContext'

interface PhoneEvent {
  device: string
  type: string
  data: Record<string, unknown>
  timestamp: string
}

interface ShortcutConfig {
  name: string
  description: string
  trigger: string
  eventType: string
  icon: string
}

const SHORTCUTS: ShortcutConfig[] = [
  {
    name: 'Hey JARVIS',
    description: 'Say "Hey Siri, Hey JARVIS" to send a voice command',
    trigger: 'Siri voice command',
    eventType: 'voice_command',
    icon: '🎙️',
  },
  {
    name: 'JARVIS Battery Alert',
    description: 'Automatically notify JARVIS when battery drops below 20%',
    trigger: 'Automation: Battery Level < 20%',
    eventType: 'battery_low',
    icon: '🔋',
  },
  {
    name: 'JARVIS I Arrived Home',
    description: 'Trigger when you arrive at your home location',
    trigger: 'Automation: Arrive at Home',
    eventType: 'location',
    icon: '🏠',
  },
  {
    name: 'JARVIS Morning Briefing',
    description: 'Get a daily summary every morning at 8am',
    trigger: 'Automation: Time of Day 8:00 AM',
    eventType: 'voice_command',
    icon: '☀️',
  },
  {
    name: 'JARVIS Send Screenshot',
    description: 'Take a screenshot and send it to JARVIS for analysis',
    trigger: 'Share Sheet / Tap shortcut',
    eventType: 'screenshot',
    icon: '📸',
  },
  {
    name: 'JARVIS Driving Mode',
    description: 'Notify JARVIS when CarPlay connects',
    trigger: 'Automation: CarPlay connects',
    eventType: 'status',
    icon: '🚗',
  },
]

const TAILSCALE_IP = '100.88.129.47'
const API_KEY = 'jarvis-local-api-key'

export default function IPhoneControl() {
  const { lastMessage, isConnected } = useWebSocket()
  const [phoneEvents, setPhoneEvents] = useState<PhoneEvent[]>([])
  const [apiKey] = useState(API_KEY)
  const [jarvisIp] = useState(TAILSCALE_IP)
  const [copied, setCopied] = useState<string | null>(null)
  const [testCommand, setTestCommand] = useState('')
  const [testResult, setTestResult] = useState('')
  const [testStatus, setTestStatus] = useState<'idle'|'loading'|'ok'|'fail'>('idle')
  const [mirrorStatus, setMirrorStatus] = useState<'idle' | 'waiting' | 'connected'>('idle')
  const [tailscaleOk, setTailscaleOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (lastMessage?.event === 'phone_event') {
      const e = lastMessage.data as PhoneEvent
      setPhoneEvents(prev => [e, ...prev].slice(0, 20))
    }
    // iPhone connected when it sends any event
    if (lastMessage?.event === 'phone_event') {
      setTailscaleOk(true)
    }
  }, [lastMessage])

  // Test Tailscale connection on mount
  useEffect(() => {
    fetch(`http://${TAILSCALE_IP}:8000/api/health/`, { signal: AbortSignal.timeout(4000) })
      .then(r => r.ok ? setTailscaleOk(true) : setTailscaleOk(false))
      .catch(() => setTailscaleOk(false))
  }, [])

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const webhookUrl = `http://${jarvisIp}:8000/api/webhooks/phone`

  const buildShortcutPayload = (sc: ShortcutConfig) => JSON.stringify({
    device_name: "My iPhone",
    event_type: sc.eventType,
    data: sc.eventType === 'voice_command'
      ? { command: "Shortcut input text" }
      : sc.eventType === 'battery_low'
      ? { level: "Battery Level" }
      : { info: sc.name },
  }, null, 2)

  const sendTestCommand = async () => {
    if (!testCommand.trim()) return
    setTestStatus('loading')
    try {
      const res = await apiFetch('/api/webhooks/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          device_name: "iPhone (test)",
          event_type: "voice_command",
          data: { command: testCommand },
        }),
      })
      const data = await res.json()
      setTestResult(data.response || JSON.stringify(data))
      setTestStatus('ok')
    } catch (e) {
      setTestResult(`Error: ${e}`)
      setTestStatus('fail')
    }
  }

  const ALL_SHORTCUTS = [
    {
      name: 'Hey JARVIS',
      emoji: '🎙️',
      trigger: 'Siri — say "Hey JARVIS"',
      body: `{\n  "device_name": "iPhone-13",\n  "event_type": "voice_command",\n  "command": "[Shortcut Input]"\n}`,
    },
    {
      name: 'JARVIS Battery Alert',
      emoji: '🔋',
      trigger: 'Automation: Battery < 20%',
      body: `{\n  "device_name": "iPhone-13",\n  "event_type": "battery_low",\n  "command": "Battery at [Battery Level]%"\n}`,
    },
    {
      name: 'JARVIS Arrived Home',
      emoji: '🏠',
      trigger: 'Automation: Arrive at Home',
      body: `{\n  "device_name": "iPhone-13",\n  "event_type": "location",\n  "command": "I just arrived home"\n}`,
    },
    {
      name: 'JARVIS Morning',
      emoji: '☀️',
      trigger: 'Automation: 9:00 AM daily',
      body: `{\n  "device_name": "iPhone-13",\n  "event_type": "voice_command",\n  "command": "Good morning JARVIS, give me my daily briefing"\n}`,
    },
    {
      name: 'JARVIS Goodnight',
      emoji: '🌙',
      trigger: 'Automation: 11:00 PM or Bedtime',
      body: `{\n  "device_name": "iPhone-13",\n  "event_type": "voice_command",\n  "command": "Activate bedside mode, set alarm for 7:30 AM"\n}`,
    },
    {
      name: 'JARVIS Driving',
      emoji: '🚗',
      trigger: 'Automation: CarPlay connects',
      body: `{\n  "device_name": "iPhone-13",\n  "event_type": "status",\n  "command": "Driving mode activated"\n}`,
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron">iPHONE INTEGRATION</h1>
          <p className="text-xs text-jarvis-muted mt-1 tracking-wider">iPhone 13 · Tailscale · Always-on connection</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm text-[10px] font-orbitron"
            style={{
              background: tailscaleOk === true ? 'rgba(0,255,136,0.07)' : tailscaleOk === false ? 'rgba(255,51,51,0.07)' : 'rgba(13,74,110,0.2)',
              border: `1px solid ${tailscaleOk === true ? 'rgba(0,255,136,0.3)' : tailscaleOk === false ? 'rgba(255,51,51,0.3)' : 'rgba(13,74,110,0.4)'}`,
              color: tailscaleOk === true ? '#00ff88' : tailscaleOk === false ? '#ff3333' : '#4a7a99',
            }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: tailscaleOk === true ? '#00ff88' : tailscaleOk === false ? '#ff3333' : '#4a7a99',
              animation: tailscaleOk === true ? 'statusPulse 2s ease-in-out infinite' : 'none',
            }} />
            <Wifi size={10} />
            {tailscaleOk === true ? 'TAILSCALE CONNECTED' : tailscaleOk === false ? 'TAILSCALE OFFLINE' : 'CHECKING...'}
          </div>
        </div>
      </div>

      {/* Live connection status panel */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'LAPTOP IP', value: TAILSCALE_IP, icon: '💻', ok: tailscaleOk },
          { label: 'iPHONE IP', value: '100.87.187.106', icon: '📱', ok: tailscaleOk },
          { label: 'WEBHOOK', value: 'READY', icon: '⚡', ok: tailscaleOk },
        ].map((item, i) => (
          <div key={i} className="panel p-3 text-center hud-corner">
            <div className="text-base mb-1">{item.icon}</div>
            <div className="text-[8px] text-jarvis-muted tracking-widest font-orbitron mb-0.5">{item.label}</div>
            <div className="text-[10px] font-mono" style={{ color: item.ok ? '#00d4ff' : '#4a7a99' }}>{item.value}</div>
            <div className="text-[7px] mt-1" style={{ color: item.ok ? '#00ff88' : '#4a7a99' }}>
              {item.ok ? '● ONLINE' : item.ok === false ? '● OFFLINE' : '○ CHECKING'}
            </div>
          </div>
        ))}
      </div>

      {/* iOS Limitation notice */}
      <div className="panel p-4" style={{ borderColor: 'rgba(0,212,255,0.15)', background: 'rgba(0,212,255,0.02)' }}>
        <div className="flex items-start gap-3">
          <div className="text-jarvis-glow mt-0.5 text-lg">ℹ</div>
          <div>
            <div className="text-xs font-semibold text-jarvis-warn tracking-wider mb-1">ABOUT iPHONE & iOS SANDBOX</div>
            <p className="text-xs text-jarvis-text leading-relaxed">
              iOS does not allow third-party apps to control the phone like Android/ADB does.
              What JARVIS <strong className="text-jarvis-glow">can</strong> do with iPhone:
              receive voice commands via Siri Shortcuts, send you push notifications,
              trigger automations based on location/time/battery, and mirror your screen via AirPlay.
              Full keyboard/mouse control is not available on iOS by design.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left col */}
        <div className="space-y-4">

          {/* Config */}
          <div className="panel p-4">
            <div className="label-jarvis mb-3">CONNECTION CONFIG</div>
            <div className="space-y-3">
              <div>
                <label className="label-jarvis">JARVIS Server IP</label>
                <div className="flex gap-2">
                  <input
                    className="input-jarvis flex-1"
                    value={jarvisIp}
                    readOnly
                    placeholder="192.168.1.X"
                  />
                </div>
                <p className="text-[9px] text-jarvis-muted mt-1">Your laptop's IP on the WiFi network. iPhone must be on same WiFi.</p>
              </div>
              <div>
                <label className="label-jarvis">API Key</label>
                <div className="flex gap-2">
                  <input
                    className="input-jarvis flex-1 font-mono text-xs"
                    value={apiKey}
                    readOnly
                  />
                  <button onClick={() => copy(apiKey, 'apikey')} className="p-2 border border-jarvis-border rounded hover:border-jarvis-glow text-jarvis-muted hover:text-jarvis-glow transition-all">
                    {copied === 'apikey' ? <CheckCircle size={13} className="text-jarvis-success" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label-jarvis">Webhook URL</label>
                <div className="flex gap-2">
                  <code className="flex-1 text-[10px] text-jarvis-glow bg-jarvis-bg px-2 py-1.5 rounded border border-jarvis-border break-all">
                    {webhookUrl}
                  </code>
                  <button onClick={() => copy(webhookUrl, 'url')} className="p-2 border border-jarvis-border rounded hover:border-jarvis-glow text-jarvis-muted hover:text-jarvis-glow transition-all">
                    {copied === 'url' ? <CheckCircle size={13} className="text-jarvis-success" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Live events feed */}
          <div className="panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="label-jarvis">LIVE EVENTS FROM iPHONE</div>
              {phoneEvents.length > 0 && (
                <button onClick={() => setPhoneEvents([])} className="text-[9px] text-jarvis-muted hover:text-jarvis-danger">CLEAR</button>
              )}
            </div>
            {phoneEvents.length === 0 ? (
              <p className="text-[11px] text-jarvis-muted">Waiting for iPhone events...</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {phoneEvents.map((e, i) => (
                  <div key={i} className="panel p-2 border-jarvis-glow/10 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-jarvis-glow font-semibold">{e.type}</span>
                      <span className="text-jarvis-muted">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-jarvis-muted mt-0.5">{e.device}</div>
                    <pre className="text-jarvis-text mt-1 whitespace-pre-wrap text-[9px]">
                      {JSON.stringify(e.data, null, 1)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connection test */}
          <div className="panel p-4 hud-corner">
            <div className="flex items-center justify-between mb-2">
              <div className="label-jarvis">LIVE CONNECTION TEST</div>
              <div className="flex items-center gap-1.5 text-[8px] font-mono"
                style={{ color: testStatus === 'ok' ? '#00ff88' : testStatus === 'fail' ? '#ff3333' : testStatus === 'loading' ? '#ff9900' : '#4a7a99' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%',
                  background: testStatus === 'ok' ? '#00ff88' : testStatus === 'fail' ? '#ff3333' : testStatus === 'loading' ? '#ff9900' : '#4a7a99',
                  animation: testStatus === 'loading' ? 'statusPulse 0.5s ease-in-out infinite' : 'none' }} />
                {testStatus === 'ok' ? 'CONNECTED' : testStatus === 'fail' ? 'FAILED' : testStatus === 'loading' ? 'TESTING...' : 'READY'}
              </div>
            </div>
            <p className="text-[10px] text-jarvis-muted mb-3">Test that your iPhone can reach JARVIS right now.</p>
            <div className="flex gap-2 mb-2">
              <input
                className="input-jarvis flex-1 text-xs"
                placeholder="Ask JARVIS anything..."
                value={testCommand}
                onChange={e => setTestCommand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendTestCommand()}
              />
              <button onClick={sendTestCommand} disabled={testStatus === 'loading'}
                className="btn-primary px-3 flex items-center gap-1"
                style={{ opacity: testStatus === 'loading' ? 0.6 : 1 }}>
                <Send size={11} />
              </button>
            </div>
            {testResult && (
              <div className="rounded p-2 text-[10px] font-mono max-h-32 overflow-y-auto"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${testStatus === 'ok' ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,51,0.2)'}`,
                  color: testStatus === 'ok' ? '#a8d8ea' : '#ff9900'
                }}>
                {testResult}
              </div>
            )}
            {/* Live events from iPhone */}
            {phoneEvents.length > 0 && (
              <div className="mt-3 pt-3 border-t border-jarvis-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] text-jarvis-muted tracking-widest font-orbitron">LIVE EVENTS FROM iPHONE</span>
                  <button onClick={() => setPhoneEvents([])} className="text-[8px] text-jarvis-muted hover:text-jarvis-danger">CLEAR</button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {phoneEvents.slice(0, 5).map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-[9px] py-1 px-2 rounded"
                      style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)' }}>
                      <span style={{ color: '#00d4ff' }}>{e.type}</span>
                      <span className="text-jarvis-muted">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center + Right */}
        <div className="lg:col-span-2 space-y-4">

          {/* Screen mirroring */}
          <ScreenMirrorSection mirrorStatus={mirrorStatus} setMirrorStatus={setMirrorStatus} />

          {/* All 6 Apple Shortcuts — permanent setup */}
          <div className="panel p-5 hud-corner">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={14} style={{ color: '#00d4ff' }} />
                <span className="text-xs font-orbitron font-bold tracking-widest" style={{ color: '#a8d8ea' }}>
                  6 APPLE SHORTCUTS — PERMANENT SETUP
                </span>
              </div>
              <span className="text-[8px] font-mono text-jarvis-muted">Open Shortcuts app → + → paste each config</span>
            </div>

            {/* Common config reminder */}
            <div className="mb-4 p-3 rounded-sm text-[10px] font-mono space-y-1"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.15)' }}>
              <div className="text-[8px] text-jarvis-muted tracking-widest mb-2">EVERY SHORTCUT USES THESE SETTINGS:</div>
              <div><span className="text-jarvis-muted">URL:</span> <span style={{ color: '#00d4ff' }}>{webhookUrl}</span>
                <button onClick={() => copy(webhookUrl, 'url-top')} className="ml-2 text-[7px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>
                  {copied === 'url-top' ? '✓' : 'COPY'}
                </button>
              </div>
              <div><span className="text-jarvis-muted">Method:</span> <span className="text-jarvis-glow">POST</span></div>
              <div><span className="text-jarvis-muted">Header:</span> <span className="text-jarvis-glow">X-API-Key: {apiKey}</span>
                <button onClick={() => copy(apiKey, 'key-top')} className="ml-2 text-[7px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>
                  {copied === 'key-top' ? '✓' : 'COPY'}
                </button>
              </div>
              <div><span className="text-jarvis-muted">Body type:</span> <span className="text-jarvis-glow">JSON</span></div>
            </div>

            <div className="space-y-3">
              {ALL_SHORTCUTS.map((sc, i) => (
                <div key={i} className="rounded-sm overflow-hidden"
                  style={{ border: '1px solid rgba(13,74,110,0.5)' }}>
                  <div className="flex items-center justify-between px-3 py-2"
                    style={{ background: 'rgba(4,22,40,0.8)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{sc.emoji}</span>
                      <div>
                        <div className="text-[10px] font-orbitron font-bold" style={{ color: '#00d4ff' }}>{sc.name}</div>
                        <div className="text-[8px] text-jarvis-muted mt-0.5">{sc.trigger}</div>
                      </div>
                    </div>
                    <button onClick={() => copy(sc.body, `sc-${i}`)}
                      className="text-[8px] px-2 py-1 rounded-sm font-orbitron transition-all flex items-center gap-1"
                      style={{ background: copied === `sc-${i}` ? 'rgba(0,255,136,0.1)' : 'rgba(0,212,255,0.08)',
                               border: `1px solid ${copied === `sc-${i}` ? 'rgba(0,255,136,0.3)' : 'rgba(0,212,255,0.2)'}`,
                               color: copied === `sc-${i}` ? '#00ff88' : '#00d4ff' }}>
                      <Copy size={9} /> {copied === `sc-${i}` ? 'COPIED!' : 'COPY JSON'}
                    </button>
                  </div>
                  <pre className="px-3 py-2 text-[9px] font-mono overflow-x-auto"
                    style={{ background: 'rgba(0,0,0,0.2)', color: '#4a7a99' }}>
                    {sc.body}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* Siri shortcut */}
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Mic size={14} className="text-jarvis-glow" />
              <h3 className="text-xs font-bold tracking-widest text-jarvis-text">SIRI → JARVIS VOICE PIPELINE</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px]">
              <div>
                <div className="text-jarvis-accent font-semibold mb-2">Setup (one-time)</div>
                <div className="space-y-2 text-jarvis-muted">
                  <div className="flex gap-2">
                    <span className="text-jarvis-glow w-4 flex-shrink-0">1.</span>
                    Open Shortcuts app on iPhone
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jarvis-glow w-4 flex-shrink-0">2.</span>
                    Tap + → Add Action → "Get contents of URL"
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jarvis-glow w-4 flex-shrink-0">3.</span>
                    Set URL to: <code className="text-jarvis-glow">{webhookUrl}</code>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jarvis-glow w-4 flex-shrink-0">4.</span>
                    Method: POST, add headers + body (see payload below)
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jarvis-glow w-4 flex-shrink-0">5.</span>
                    Name the shortcut "Hey JARVIS"
                  </div>
                  <div className="flex gap-2">
                    <span className="text-jarvis-glow w-4 flex-shrink-0">6.</span>
                    Say: <span className="text-jarvis-glow">"Hey Siri, Hey JARVIS"</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-jarvis-accent font-semibold mb-2">Request Config</div>
                <div className="text-[10px] space-y-2">
                  <div>
                    <span className="text-jarvis-muted">Header:</span>
                    <code className="block mt-0.5 bg-jarvis-bg px-2 py-1 rounded border border-jarvis-border text-jarvis-glow">
                      X-API-Key: {apiKey}
                    </code>
                  </div>
                  <div>
                    <span className="text-jarvis-muted">Body (JSON):</span>
                    <pre className="mt-0.5 bg-jarvis-bg px-2 py-1.5 rounded border border-jarvis-border text-jarvis-glow overflow-x-auto text-[9px]">{`{
  "device_name": "My iPhone",
  "event_type": "voice_command",
  "data": {
    "command": "[Shortcut Input]"
  }
}`}</pre>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => copy(`{\n  "device_name": "My iPhone",\n  "event_type": "voice_command",\n  "data": { "command": "[Shortcut Input]" }\n}`, 'siri-body')}
                      className="btn-primary text-[9px] flex items-center gap-1"
                    >
                      {copied === 'siri-body' ? <CheckCircle size={10} /> : <Copy size={10} />}
                      COPY BODY
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Push notifications */}
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={14} className="text-jarvis-glow" />
              <h3 className="text-xs font-bold tracking-widest text-jarvis-text">PUSH NOTIFICATIONS TO iPHONE</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px]">
              <div>
                <div className="text-jarvis-accent font-semibold mb-2">ntfy (Recommended — Free)</div>
                <div className="space-y-1.5 text-jarvis-muted">
                  <p>1. Install ntfy app from App Store</p>
                  <p>2. Subscribe to a unique topic (e.g. <code className="text-jarvis-glow">jarvis-alan</code>)</p>
                  <p>3. Set in <code className="text-jarvis-glow">backend/.env</code>:</p>
                  <pre className="bg-jarvis-bg px-2 py-1.5 rounded border border-jarvis-border text-jarvis-glow text-[9px]">{`NTFY_URL=https://ntfy.sh
NTFY_TOPIC=jarvis-alan`}</pre>
                  <p>JARVIS will push alerts directly to your iPhone.</p>
                </div>
              </div>
              <div>
                <div className="text-jarvis-accent font-semibold mb-2">Pushover (Rich notifications)</div>
                <div className="space-y-1.5 text-jarvis-muted">
                  <p>1. Install Pushover app ($5 one-time)</p>
                  <p>2. Create application at pushover.net</p>
                  <p>3. Get User Key + App Token</p>
                  <p>4. JARVIS can send rich notifications with sound, priority, and action buttons</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ShortcutCard({ shortcut, webhookUrl, apiKey, payload, onCopy, copied }: {
  shortcut: ShortcutConfig
  webhookUrl: string
  apiKey: string
  payload: string
  onCopy: (text: string, key: string) => void
  copied: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const copyKey = `sc-${shortcut.name}`

  return (
    <div className="panel border-jarvis-border/50">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-jarvis-border/10 transition-colors rounded"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{shortcut.icon}</span>
          <div>
            <div className="text-xs font-semibold text-jarvis-text">{shortcut.name}</div>
            <div className="text-[10px] text-jarvis-muted">{shortcut.trigger}</div>
          </div>
        </div>
        <div className={clsx('text-jarvis-muted transition-transform', expanded && 'rotate-180')}>▾</div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-jarvis-border/30 pt-3 space-y-2">
          <p className="text-[10px] text-jarvis-muted">{shortcut.description}</p>
          <div>
            <div className="text-[9px] text-jarvis-muted mb-1">WEBHOOK URL</div>
            <code className="text-[9px] text-jarvis-glow block">{webhookUrl}</code>
          </div>
          <div>
            <div className="text-[9px] text-jarvis-muted mb-1">BODY (JSON)</div>
            <pre className="text-[9px] text-jarvis-text bg-jarvis-bg rounded p-2 border border-jarvis-border overflow-x-auto">{payload}</pre>
          </div>
          <button
            onClick={() => onCopy(payload, copyKey)}
            className="btn-primary text-[9px] flex items-center gap-1.5"
          >
            {copied === copyKey ? <CheckCircle size={10} /> : <Copy size={10} />}
            COPY PAYLOAD
          </button>
        </div>
      )}
    </div>
  )
}

type MirrorStatus = 'idle' | 'waiting' | 'connected'

function ScreenMirrorSection({ mirrorStatus, setMirrorStatus }: {
  mirrorStatus: MirrorStatus
  setMirrorStatus: (s: MirrorStatus) => void
}) {
  const phoneUrl = `https://100.88.129.47:8000/mirror/phone`
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(phoneUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="panel p-5 hud-corner">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Share2 size={14} style={{ color: '#00d4ff' }} />
          <span className="text-xs font-orbitron font-bold tracking-widest" style={{ color: '#a8d8ea' }}>
            iPHONE SCREEN MIRROR
          </span>
        </div>
        <span className="text-[8px] font-orbitron px-2 py-1 rounded-sm"
          style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
          BUILT-IN · NO THIRD-PARTY
        </span>
      </div>

      {/* Live viewer iframe */}
      <div className="mb-4 rounded overflow-hidden" style={{
        border: '1px solid rgba(0,212,255,0.3)',
        background: '#000',
        aspectRatio: '16/9',
        position: 'relative',
      }}>
        <iframe
          src="https://100.88.129.47:8000/mirror/view"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="JARVIS Screen Mirror"
          allow="camera; microphone; display-capture"
        />
      </div>

      {/* How to use */}
      <div className="space-y-3">
        <div className="text-[10px] font-orbitron text-jarvis-muted tracking-widest mb-2">
          HOW TO START MIRRORING
        </div>

        {[
          { n: '1', t: 'Open Safari on your iPhone (must be Safari, not Chrome)' },
          { n: '2', t: 'Navigate to the URL below' },
          { n: '3', t: 'Tap "START SCREEN SHARE" — iOS will ask what to share' },
          { n: '4', t: 'Select "Screen" — your screen streams live into JARVIS above' },
        ].map(s => (
          <div key={s.n} className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-orbitron font-bold"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>
              {s.n}
            </div>
            <span className="text-[11px] text-jarvis-muted pt-0.5">{s.t}</span>
          </div>
        ))}

        {/* iPhone URL */}
        <div className="flex items-center gap-2 mt-2">
          <code className="flex-1 text-[10px] px-2 py-1.5 rounded font-mono"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>
            {phoneUrl}
          </code>
          <button onClick={copy} className="flex-shrink-0 text-[9px] px-2 py-1.5 rounded font-orbitron transition-all"
            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: copied ? '#00ff88' : '#00d4ff' }}>
            {copied ? '✓' : 'COPY'}
          </button>
        </div>

        <div className="text-[8px] text-jarvis-muted px-2 py-1.5 rounded"
          style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.1)' }}>
          ✅ No third-party apps needed &nbsp;·&nbsp; Uses iOS 16.4+ WebRTC &nbsp;·&nbsp; Works over Tailscale or WiFi &nbsp;·&nbsp; View-only (iOS security)
        </div>
      </div>
    </div>
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = { mirrorStatus, setMirrorStatus }
}

function _OldScreenMirrorSection({ mirrorStatus, setMirrorStatus }: {
  mirrorStatus: MirrorStatus
  setMirrorStatus: (s: MirrorStatus) => void
}) {
  const [activeMethod, setActiveMethod] = useState<'5kplayer' | 'lonelyscreen' | 'reflector'>('5kplayer')

  const methods = {
    '5kplayer': {
      name: '5KPlayer',
      badge: 'FREE',
      badgeColor: '#00ff88',
      steps: [
        'Download & install 5KPlayer on your laptop',
        'Open 5KPlayer → click the AirPlay icon (top bar)',
        'On iPhone: swipe down → Control Centre',
        'Tap Screen Mirroring → select "5KPlayer"',
        'Your iPhone screen appears on the laptop instantly',
      ],
      url: 'https://www.5kplayer.com/airplay/airplay-windows.htm',
      note: 'Best free option. Supports audio too.',
    },
    'lonelyscreen': {
      name: 'LonelyScreen',
      badge: 'FREE',
      badgeColor: '#00ff88',
      steps: [
        'Download & install LonelyScreen on your laptop',
        'Launch LonelyScreen — it auto-creates an AirPlay receiver',
        'On iPhone: swipe down → Control Centre',
        'Tap Screen Mirroring → select "LonelyScreen"',
        'Mirror active — laptop sees iPhone screen',
      ],
      url: 'https://www.lonelyscreen.com/',
      note: 'Simple one-click setup. No configuration needed.',
    },
    'reflector': {
      name: 'Reflector 4',
      badge: 'PAID',
      badgeColor: '#ff9900',
      steps: [
        'Purchase & install Reflector 4 on your laptop',
        'Launch Reflector — it appears in system tray',
        'On iPhone: swipe down → Control Centre',
        'Tap Screen Mirroring → select your laptop name',
        'Full HD mirroring with recording capability',
      ],
      url: 'https://www.airsquirrels.com/reflector/',
      note: 'Best quality. Supports recording & streaming.',
    },
  }

  const m = methods[activeMethod]

  return (
    <div className="panel p-5 hud-corner">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Share2 size={14} style={{ color: '#00d4ff' }} />
          <span className="text-xs font-orbitron font-bold tracking-widest" style={{ color: '#a8d8ea' }}>
            iPHONE SCREEN MIRRORING
          </span>
        </div>
        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-sm text-[9px] font-orbitron" style={{
          background: mirrorStatus === 'connected'
            ? 'rgba(0,255,136,0.08)' : mirrorStatus === 'waiting'
            ? 'rgba(255,153,0,0.08)' : 'rgba(13,74,110,0.3)',
          border: `1px solid ${mirrorStatus === 'connected' ? 'rgba(0,255,136,0.3)' : mirrorStatus === 'waiting' ? 'rgba(255,153,0,0.3)' : 'rgba(13,74,110,0.5)'}`,
          color: mirrorStatus === 'connected' ? '#00ff88' : mirrorStatus === 'waiting' ? '#ff9900' : '#4a7a99',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: mirrorStatus === 'connected' ? '#00ff88' : mirrorStatus === 'waiting' ? '#ff9900' : '#4a7a99',
            animation: mirrorStatus !== 'idle' ? 'statusPulse 2s ease-in-out infinite' : 'none',
          }} />
          {mirrorStatus === 'connected' ? 'MIRRORING ACTIVE' : mirrorStatus === 'waiting' ? 'WAITING FOR PHONE' : 'NOT CONNECTED'}
        </div>
      </div>

      {/* Mirror preview area */}
      <div className="relative mb-5 rounded overflow-hidden" style={{
        background: 'rgba(0,0,0,0.6)',
        border: `1px solid ${mirrorStatus === 'connected' ? 'rgba(0,212,255,0.4)' : 'rgba(13,74,110,0.4)'}`,
        minHeight: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {mirrorStatus !== 'connected' ? (
          <div className="text-center py-8">
            {/* Phone frame outline */}
            <div className="mx-auto mb-4 relative" style={{
              width: 64, height: 110,
              border: '2px solid rgba(0,212,255,0.3)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,212,255,0.4)' }} />
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full" style={{ background: 'rgba(0,212,255,0.2)' }} />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full" style={{ border: '1px solid rgba(0,212,255,0.2)' }} />
            </div>
            <p className="text-[10px] text-jarvis-muted font-mono">
              {mirrorStatus === 'waiting' ? 'SELECT JARVIS ON YOUR iPHONE SCREEN MIRRORING...' : 'MIRROR NOT ACTIVE'}
            </p>
            <p className="text-[9px] text-jarvis-muted mt-1 opacity-60">
              Follow setup steps below to begin mirroring
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-jarvis-success text-xs font-mono">✓ SCREEN MIRROR ACTIVE</div>
            <div className="text-[10px] text-jarvis-muted mt-1">Your iPhone screen is visible in the mirroring app</div>
          </div>
        )}
        {/* Corner scan lines */}
        {mirrorStatus === 'waiting' && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
              animation: 'scanBeam 3s linear infinite',
            }} />
          </div>
        )}
      </div>

      {/* Method selector */}
      <div className="flex gap-2 mb-4">
        {(Object.keys(methods) as (keyof typeof methods)[]).map(key => (
          <button
            key={key}
            onClick={() => setActiveMethod(key)}
            className="flex-1 px-2 py-1.5 rounded-sm text-[9px] font-orbitron transition-all"
            style={{
              background: activeMethod === key ? 'rgba(0,212,255,0.1)' : 'rgba(4,22,40,0.5)',
              border: `1px solid ${activeMethod === key ? 'rgba(0,212,255,0.4)' : 'rgba(13,74,110,0.4)'}`,
              color: activeMethod === key ? '#00d4ff' : '#4a7a99',
            }}
          >
            {methods[key].name}
            <span className="ml-1 text-[7px]" style={{ color: methods[key].badgeColor }}>
              {methods[key].badge}
            </span>
          </button>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-2 mb-4">
        {m.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-orbitron font-bold"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>
              {i + 1}
            </div>
            <span className="text-[11px] text-jarvis-muted pt-0.5">{step}</span>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-jarvis-muted mb-4 px-2 py-1.5 rounded"
        style={{ background: 'rgba(0,170,255,0.05)', border: '1px solid rgba(0,170,255,0.15)' }}>
        💡 {m.note}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <a href={m.url} target="_blank" rel="noreferrer"
          className="flex-1 btn-primary text-center flex items-center justify-center gap-1.5 text-[9px]">
          <ExternalLink size={10} /> DOWNLOAD {m.name.toUpperCase()}
        </a>
        <button
          onClick={() => setMirrorStatus(mirrorStatus === 'waiting' ? 'idle' : 'waiting')}
          className="px-4 py-1.5 rounded-sm text-[9px] font-orbitron transition-all"
          style={{
            background: mirrorStatus === 'waiting' ? 'rgba(255,51,51,0.1)' : 'rgba(0,212,255,0.08)',
            border: `1px solid ${mirrorStatus === 'waiting' ? 'rgba(255,51,51,0.3)' : 'rgba(0,212,255,0.3)'}`,
            color: mirrorStatus === 'waiting' ? '#ff3333' : '#00d4ff',
          }}
        >
          {mirrorStatus === 'waiting' ? 'CANCEL' : mirrorStatus === 'connected' ? 'DISCONNECT' : 'START MIRRORING'}
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-jarvis-border">
        <p className="text-[9px] text-jarvis-muted">
          <span style={{ color: '#ff9900' }}>Note:</span> iOS prevents remote control from a PC (Apple security).
          Mirroring is <strong>view-only</strong>.
        </p>
      </div>
    </div>
  )
}
// End of old section
