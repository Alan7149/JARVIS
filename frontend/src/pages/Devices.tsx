import { apiFetch } from '../lib/api'
import { useEffect, useState } from 'react'
import { Smartphone, Monitor, Server, Wifi, WifiOff, Plus } from 'lucide-react'

interface Device {
  id: number
  name: string
  device_type: string
  platform: string | null
  is_online: boolean
  last_seen: string | null
}

const DeviceIcon = ({ type }: { type: string }) => {
  if (type === 'phone') return <Smartphone size={18} />
  if (type === 'server') return <Server size={18} />
  return <Monitor size={18} />
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', device_type: 'phone', platform: '', webhook_url: '' })

  const load = async () => {
    const data = await apiFetch('/api/devices/').then(r => r.json())
    setDevices(data)
  }

  useEffect(() => { load() }, [])

  const register = async () => {
    await apiFetch('/api/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowForm(false)
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-widest glow-text">CONNECTED DEVICES</h1>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> REGISTER DEVICE
        </button>
      </div>

      {showForm && (
        <div className="panel p-5 border-jarvis-glow/30">
          <h3 className="text-xs tracking-widest text-jarvis-muted mb-4">REGISTER NEW DEVICE</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-jarvis">Device Name</label>
              <input className="input-jarvis" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Alan's iPhone" />
            </div>
            <div>
              <label className="label-jarvis">Type</label>
              <select className="input-jarvis" value={form.device_type} onChange={e => setForm(f => ({ ...f, device_type: e.target.value }))}>
                <option value="phone">Phone</option>
                <option value="laptop">Laptop</option>
                <option value="server">Server</option>
              </select>
            </div>
            <div>
              <label className="label-jarvis">Platform</label>
              <input className="input-jarvis" value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} placeholder="iOS / Android / Windows" />
            </div>
            <div>
              <label className="label-jarvis">Webhook URL (optional)</label>
              <input className="input-jarvis" value={form.webhook_url} onChange={e => setForm(f => ({ ...f, webhook_url: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={register} className="btn-primary">REGISTER</button>
            <button onClick={() => setShowForm(false)} className="btn-danger">CANCEL</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Always show the local laptop */}
        <div className="panel p-5 border-jarvis-glow/30 shadow-glow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="text-jarvis-glow"><Monitor size={20} /></div>
            <div className="flex items-center gap-1.5">
              <Wifi size={11} className="text-jarvis-success animate-pulse" />
              <span className="text-[10px] text-jarvis-success tracking-widest">ONLINE</span>
            </div>
          </div>
          <div className="text-sm font-semibold text-jarvis-text">This Laptop</div>
          <div className="text-[10px] text-jarvis-muted mt-1">Windows · Primary Device</div>
          <div className="mt-3 pt-3 border-t border-jarvis-border/50">
            <div className="text-[9px] text-jarvis-muted tracking-widest">HOST DEVICE · FULL ACCESS</div>
          </div>
        </div>

        {devices.map(device => (
          <div key={device.id} className={`panel p-5 ${device.is_online ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={device.is_online ? 'text-jarvis-accent' : 'text-jarvis-muted'}>
                <DeviceIcon type={device.device_type} />
              </div>
              <div className="flex items-center gap-1.5">
                {device.is_online ? (
                  <><Wifi size={11} className="text-jarvis-success" /><span className="text-[10px] text-jarvis-success tracking-widest">ONLINE</span></>
                ) : (
                  <><WifiOff size={11} className="text-jarvis-muted" /><span className="text-[10px] text-jarvis-muted tracking-widest">OFFLINE</span></>
                )}
              </div>
            </div>
            <div className="text-sm font-semibold text-jarvis-text">{device.name}</div>
            <div className="text-[10px] text-jarvis-muted mt-1">{device.platform || device.device_type}</div>
            {device.last_seen && (
              <div className="mt-3 pt-3 border-t border-jarvis-border/50">
                <div className="text-[9px] text-jarvis-muted">LAST SEEN {new Date(device.last_seen).toLocaleString()}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="panel p-5">
        <h3 className="text-xs tracking-widest text-jarvis-muted mb-4">PHONE INTEGRATION GUIDE</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-jarvis-text">
          <div>
            <div className="text-jarvis-accent font-semibold mb-2">Android (Tasker)</div>
            <div className="space-y-1 text-jarvis-muted">
              <p>1. Install Tasker + AutoVoice</p>
              <p>2. Create Profile → Voice Command trigger</p>
              <p>3. Add HTTP POST action to:</p>
              <code className="text-jarvis-glow text-[10px] block mt-1 bg-jarvis-bg px-2 py-1 rounded">
                POST /api/webhooks/phone<br/>
                X-API-Key: [your API key]
              </code>
            </div>
          </div>
          <div>
            <div className="text-jarvis-accent font-semibold mb-2">iPhone (Shortcuts)</div>
            <div className="space-y-1 text-jarvis-muted">
              <p>1. Open Shortcuts app</p>
              <p>2. Create shortcut with "Get contents of URL"</p>
              <p>3. Set method POST, add headers:</p>
              <code className="text-jarvis-glow text-[10px] block mt-1 bg-jarvis-bg px-2 py-1 rounded">
                X-API-Key: [your API key]<br/>
                Content-Type: application/json
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
