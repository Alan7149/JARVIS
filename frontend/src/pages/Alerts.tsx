import { apiFetch } from '../lib/api'
import { useEffect, useState } from 'react'
import { Bell, BellOff, Plus, Trash2, Activity, Clock, Moon } from 'lucide-react'

interface Alert {
  id: number
  name: string
  condition_type: string
  is_active: boolean
  last_checked: string | null
  last_triggered: string | null
  triggered?: boolean
  down_since?: string | null
  snoozed_until?: string | null
}

interface AlertEvent {
  id: number
  alert_id: number
  message: string
  severity: string
  created_at: string
}

const CONDITION_LABELS: Record<string, string> = {
  http_health: 'HTTP Health',
  disk_usage: 'Disk Usage',
  cpu_usage: 'CPU Usage',
  port_check: 'Port Check',
  process_running: 'Process Running',
  file_exists: 'File Exists',
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    condition_type: 'http_health',
    url: '',
    mount: 'C:\\',
    threshold: '85',
    port: '8000',
    process_name: '',
    frequency_seconds: '300',
  })

  const load = async () => {
    const [ar, er] = await Promise.all([
      apiFetch('/api/alerts/').then(r => r.json()),
      apiFetch('/api/alerts/events').then(r => r.json()),
    ])
    setAlerts(ar)
    setEvents(er)
  }

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [])

  const toggle = async (id: number) => {
    await apiFetch(`/api/alerts/${id}/toggle`, { method: 'PATCH' })
    load()
  }

  const snooze = async (id: number, hours: number) => {
    await apiFetch(`/api/alerts/${id}/snooze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) })
    load()
  }
  const unsnooze = async (id: number) => {
    await apiFetch(`/api/alerts/${id}/unsnooze`, { method: 'POST' })
    load()
  }
  const hoursTillMidnight = () => { const n = new Date(); const m = new Date(n); m.setHours(24, 0, 0, 0); return (m.getTime() - n.getTime()) / 3600000 }

  const del = async (id: number) => {
    if (!confirm('Delete this alert?')) return
    await apiFetch(`/api/alerts/${id}`, { method: 'DELETE' })
    load()
  }

  const buildConditionConfig = () => {
    switch (form.condition_type) {
      case 'http_health': return { url: form.url, expected_status: 200 }
      case 'disk_usage': return { mount: form.mount, threshold_percent: Number(form.threshold) }
      case 'cpu_usage': return { threshold_percent: Number(form.threshold) }
      case 'port_check': return { port: Number(form.port), should_be_open: true }
      case 'process_running': return { process_name: form.process_name, should_run: true }
      default: return {}
    }
  }

  const submit = async () => {
    await apiFetch('/api/alerts/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        condition_type: form.condition_type,
        condition_config: buildConditionConfig(),
        frequency_seconds: Number(form.frequency_seconds),
      }),
    })
    setShowForm(false)
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-widest glow-text">ALERT RULES</h1>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary flex items-center gap-2">
          <Plus size={12} /> NEW ALERT
        </button>
      </div>

      {showForm && (
        <div className="panel p-5 border-jarvis-glow/30">
          <h3 className="text-xs tracking-widest text-jarvis-muted mb-4">CONFIGURE ALERT</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-jarvis">Alert Name</label>
              <input className="input-jarvis" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Check Django server" />
            </div>
            <div>
              <label className="label-jarvis">Condition Type</label>
              <select className="input-jarvis" value={form.condition_type} onChange={e => setForm(f => ({ ...f, condition_type: e.target.value }))}>
                {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {form.condition_type === 'http_health' && (
              <div className="col-span-2">
                <label className="label-jarvis">URL to Monitor</label>
                <input className="input-jarvis" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="http://localhost:8000/api/health/" />
              </div>
            )}
            {form.condition_type === 'disk_usage' && (
              <div>
                <label className="label-jarvis">Drive / Mount</label>
                <input className="input-jarvis" value={form.mount} onChange={e => setForm(f => ({ ...f, mount: e.target.value }))} />
              </div>
            )}
            {(form.condition_type === 'disk_usage' || form.condition_type === 'cpu_usage') && (
              <div>
                <label className="label-jarvis">Threshold %</label>
                <input className="input-jarvis" type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} />
              </div>
            )}
            {form.condition_type === 'port_check' && (
              <div>
                <label className="label-jarvis">Port Number</label>
                <input className="input-jarvis" type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
              </div>
            )}
            {form.condition_type === 'process_running' && (
              <div>
                <label className="label-jarvis">Process Name</label>
                <input className="input-jarvis" value={form.process_name} onChange={e => setForm(f => ({ ...f, process_name: e.target.value }))} placeholder="python.exe" />
              </div>
            )}
            <div>
              <label className="label-jarvis">Check Frequency (seconds)</label>
              <input className="input-jarvis" type="number" value={form.frequency_seconds} onChange={e => setForm(f => ({ ...f, frequency_seconds: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={submit} className="btn-primary">CREATE ALERT</button>
            <button onClick={() => setShowForm(false)} className="btn-danger">CANCEL</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {alerts.length === 0 && <p className="text-jarvis-muted text-sm">No alerts configured.</p>}
        {alerts.map(alert => {
          const snoozed = !!alert.snoozed_until && new Date(alert.snoozed_until) > new Date()
          const state = !alert.is_active ? 'OFF' : snoozed ? 'SNOOZED' : alert.triggered ? 'TRIGGERED' : 'OK'
          const stateColor = state === 'TRIGGERED' ? '#ff3333' : state === 'SNOOZED' ? '#a8a0c0' : state === 'OK' ? '#00ff88' : '#4a7a99'
          return (
          <div key={alert.id} className={`panel p-4 ${alert.is_active ? 'border-jarvis-border' : 'opacity-50'}`}
            style={state === 'TRIGGERED' ? { borderColor: 'rgba(255,51,51,0.4)', boxShadow: '0 0 14px rgba(255,51,51,0.12)' } : undefined}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {alert.is_active ? <Bell size={14} style={{ color: stateColor }} /> : <BellOff size={14} className="text-jarvis-muted" />}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-jarvis-text font-medium">{alert.name}</span>
                    <span className="text-[8px] font-orbitron tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${stateColor}1a`, border: `1px solid ${stateColor}55`, color: stateColor }}>{state}</span>
                  </div>
                  <div className="text-[10px] text-jarvis-muted mt-0.5">
                    {CONDITION_LABELS[alert.condition_type]} &nbsp;·&nbsp;
                    {snoozed ? `Snoozed until ${new Date(alert.snoozed_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : alert.triggered && alert.down_since ? `Down since ${new Date(alert.down_since).toLocaleString()}`
                      : alert.last_triggered ? `Last triggered: ${new Date(alert.last_triggered).toLocaleString()}` : 'Never triggered'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(alert.id)} className={`text-[10px] px-3 py-1.5 border rounded tracking-widest transition-all ${alert.is_active ? 'border-jarvis-warn text-jarvis-warn hover:bg-jarvis-warn/10' : 'border-jarvis-success text-jarvis-success hover:bg-jarvis-success/10'}`}>
                  {alert.is_active ? 'DISABLE' : 'ENABLE'}
                </button>
                <button onClick={() => del(alert.id)} className="p-1.5 border border-jarvis-border text-jarvis-muted hover:text-jarvis-danger hover:border-jarvis-danger rounded transition-all">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {/* Snooze controls */}
            {alert.is_active && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-jarvis-border/30">
                {snoozed ? (
                  <button onClick={() => unsnooze(alert.id)} className="flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded tracking-widest" style={{ border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}>
                    <Bell size={10} /> WAKE NOW
                  </button>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-[8px] text-jarvis-muted font-orbitron tracking-widest"><Moon size={9} /> SNOOZE:</span>
                    <button onClick={() => snooze(alert.id, 1)} className="text-[9px] px-2 py-1 rounded border border-jarvis-border text-jarvis-muted hover:text-jarvis-text hover:border-jarvis-glow/40">1H</button>
                    <button onClick={() => snooze(alert.id, 4)} className="text-[9px] px-2 py-1 rounded border border-jarvis-border text-jarvis-muted hover:text-jarvis-text hover:border-jarvis-glow/40">4H</button>
                    <button onClick={() => snooze(alert.id, hoursTillMidnight())} className="flex items-center gap-1 text-[9px] px-2 py-1 rounded border border-jarvis-border text-jarvis-muted hover:text-jarvis-text hover:border-jarvis-glow/40"><Clock size={9} /> TODAY</button>
                  </>
                )}
              </div>
            )}
          </div>
        )})}
      </div>

      <div>
        <h2 className="text-sm font-bold tracking-widest text-jarvis-muted mb-3 flex items-center gap-2">
          <Activity size={12} /> RECENT EVENTS
        </h2>
        <div className="space-y-2">
          {events.length === 0 && <p className="text-jarvis-muted text-xs">No recent alert events.</p>}
          {events.slice(0, 20).map(e => {
            const c = e.severity === 'success' ? '#00ff88' : e.severity === 'warning' ? '#ff9900' : e.severity === 'info' ? '#00d4ff' : '#ff3333'
            return (
            <div key={e.id} className="panel p-3 text-xs" style={{ borderColor: `${c}33` }}>
              <span style={{ color: c }}>{e.message}</span>
              <span className="text-jarvis-muted ml-2">{new Date(e.created_at).toLocaleString()}</span>
            </div>
          )})}
        </div>
      </div>
    </div>
  )
}
