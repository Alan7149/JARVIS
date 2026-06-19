// @ts-nocheck
import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import {
  Mic, Volume2, Bell, BellOff, Shield, Eye, Cpu, Palette,
  Globe, Lock, HelpCircle, FileText, Zap, Target, Sliders,
  ToggleLeft, ToggleRight, Save, RotateCcw, Play, TestTube,
  Moon, Sun, Activity, Database, Key, Monitor, Wifi,
  ChevronRight, CheckCircle, XCircle, AlertCircle, Info,
  Terminal, Wrench
} from 'lucide-react'
import ThreatMatrix from './ThreatMatrix'
import CommandDeck from './CommandDeck'
import Tools from './Tools'
import Logs from './Logs'
import Help from './Help'
import { setSoundEnabled } from '../lib/sounds'
import { setTextSize } from '../lib/textScale'

// ── Types ────────────────────────────────────────────────────────
interface Settings {
  wake_word_enabled: boolean
  wake_words: string[]
  mic_sensitivity: number
  tts_voice: string
  tts_rate: number
  tts_pitch: number
  jarvis_muted: boolean
  proactivity_level: string
  eye_reminders_enabled: boolean
  eye_reminder_min_mins: number
  eye_reminder_max_mins: number
  break_interval_mins: number
  work_mode_auto_dnd: boolean
  auto_mute_meetings: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string
  quiet_hours_end: string
  cpu_alert_threshold: number
  ram_alert_threshold: number
  disk_alert_threshold: number
  ai_model: string
  response_style: string
  temperature: number
  monitors: Record<string, boolean>
  obsidian_vault_path: string
  ntfy_push_topic: string
  accent_color: string
  animation_intensity: string
  glitch_effects: boolean
  boot_screen: boolean
  ui_density: string
  ui_sound_effects: boolean
  text_size: string
  launch_on_login: boolean
  start_minimized: boolean
}

interface Status {
  dnd_active: boolean
  work_mode: boolean
  wake_word_running: boolean
}

// ── Shared primitives ────────────────────────────────────────────
function SectionHeader({ icon, title, desc }: { icon: any; title: string; desc?: string }) {
  const Icon = icon
  return (
    <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid rgba(0,212,255,0.12)' }}>
      <div className="w-8 h-8 rounded-sm flex items-center justify-center"
        style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)' }}>
        <Icon size={14} style={{ color: '#00d4ff' }} />
      </div>
      <div>
        <div className="font-orbitron text-[11px] font-bold tracking-[0.2em]" style={{ color: '#00d4ff' }}>{title}</div>
        {desc && <div className="text-[9px] tracking-wider mt-0.5" style={{ color: 'rgba(168,216,234,0.4)' }}>{desc}</div>}
      </div>
    </div>
  )
}

function Toggle({ value, onChange, label, desc }: any) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-sm"
      style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.08)' }}>
      <div>
        <div className="text-[10px] font-orbitron tracking-wider" style={{ color: '#e8f4f8' }}>{label}</div>
        {desc && <div className="text-[8px] mt-0.5 tracking-wide" style={{ color: 'rgba(168,216,234,0.4)' }}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!value)}
        className="flex-shrink-0 transition-all duration-200"
        style={{ color: value ? '#00ff88' : 'rgba(168,216,234,0.2)' }}>
        {value ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
      </button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: any) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-orbitron tracking-wider" style={{ color: 'rgba(168,216,234,0.6)' }}>{label}</span>
        <span className="text-[10px] font-orbitron" style={{ color: '#00d4ff' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none outline-none cursor-pointer"
        style={{ background: `linear-gradient(90deg, #00d4ff ${((value - min) / (max - min)) * 100}%, rgba(0,212,255,0.15) 0%)` }}
      />
    </div>
  )
}

function Select({ label, value, options, onChange }: any) {
  return (
    <div className="py-2">
      <label className="text-[9px] font-orbitron tracking-wider block mb-1.5" style={{ color: 'rgba(168,216,234,0.6)' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-sm font-orbitron text-[9px] tracking-wider outline-none appearance-none cursor-pointer"
        style={{ background: 'rgba(4,15,30,0.9)', border: '1px solid rgba(0,212,255,0.2)', color: '#e8f4f8' }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder = '' }: any) {
  return (
    <div className="py-2">
      <label className="text-[9px] font-orbitron tracking-wider block mb-1.5" style={{ color: 'rgba(168,216,234,0.6)' }}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-sm font-mono text-[10px] outline-none"
        style={{ background: 'rgba(4,15,30,0.9)', border: '1px solid rgba(0,212,255,0.2)', color: '#e8f4f8' }} />
    </div>
  )
}

function ActionButton({ icon, label, onClick, color = '#00d4ff', loading = false }: any) {
  const Icon = icon
  return (
    <button onClick={onClick} disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-sm font-orbitron text-[9px] tracking-widest transition-all"
      style={{
        background: `${color}08`,
        border: `1px solid ${color}30`,
        color: color,
        opacity: loading ? 0.6 : 1,
      }}>
      <Icon size={11} />
      {label}
    </button>
  )
}

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' | 'info' }) {
  const color = type === 'success' ? '#00ff88' : type === 'error' ? '#ff4444' : '#00d4ff'
  const Icon = type === 'success' ? CheckCircle : type === 'error' ? XCircle : Info
  return (
    <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-sm z-50 font-orbitron text-[10px] tracking-wider"
      style={{ background: '#020b18', border: `1px solid ${color}50`, color, boxShadow: `0 0 20px ${color}20` }}>
      <Icon size={12} />
      {msg}
    </div>
  )
}

// ── Sidebar tab list ─────────────────────────────────────────────
const TABS = [
  { id: 'voice',       icon: Mic,          label: 'VOICE & WAKE WORD' },
  { id: 'proactive',   icon: Bell,         label: 'PROACTIVITY & DND' },
  { id: 'ai',          icon: Cpu,          label: 'AI & MODEL' },
  { id: 'monitors',    icon: Activity,     label: 'MONITORS' },
  { id: 'integrations',icon: Globe,        label: 'INTEGRATIONS' },
  { id: 'appearance',  icon: Palette,      label: 'APPEARANCE' },
  { id: 'startup',     icon: Zap,          label: 'STARTUP & SYSTEM' },
  { id: 'privacy',     icon: Lock,         label: 'DATA & PRIVACY' },
  { id: 'threat',      icon: Shield,       label: 'THREAT MATRIX' },
  { id: 'deck',        icon: Terminal,     label: 'COMMAND DECK' },
  { id: 'tools',       icon: Wrench,       label: 'TOOL REGISTRY' },
  { id: 'logs',        icon: FileText,     label: 'AUDIT LOGS' },
  { id: 'advanced',    icon: Sliders,      label: 'ADVANCED (LINK)' },
  { id: 'help',        icon: HelpCircle,   label: 'HELP & COMMANDS' },
  { id: 'about',       icon: Info,         label: 'ABOUT' },
]

// ── Main ─────────────────────────────────────────────────────────
export default function Settings() {
  const [tab, setTab] = useState('voice')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Status>({ dnd_active: false, work_mode: false, wake_word_running: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<Partial<Settings>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [dndMinutes, setDndMinutes] = useState(60)
  const [testingVoice, setTestingVoice] = useState(false)
  const [testingNotif, setTestingNotif] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const res = await apiFetch('/api/settings')
      const j = await res.json()
      setSettings(j.settings)
      setStatus(j.status ?? {})
    } catch (e) {
      showToast('Failed to load settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Merge a change into dirty queue
  const change = (updates: Partial<Settings>) => {
    setSettings(s => s ? { ...s, ...updates } : s)
    setDirty(d => ({ ...d, ...updates }))
  }

  const changeMonitor = (key: string, val: boolean) => {
    setSettings(s => s ? { ...s, monitors: { ...s.monitors, [key]: val } } : s)
    setDirty(d => ({ ...d, monitors: { ...(d.monitors as any ?? {}), [key]: val } }))
  }

  const save = async () => {
    if (!Object.keys(dirty).length) { showToast('No changes to save', 'info'); return }
    setSaving(true)
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dirty),
      })
      const j = await res.json()
      setSettings(j.settings)
      setDirty({})
      showToast('Settings saved', 'success')
    } catch {
      showToast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!confirm('Reset all settings to defaults?')) return
    const res = await apiFetch('/api/settings/reset', { method: 'POST' })
    const j = await res.json()
    setSettings(j.settings)
    setDirty({})
    showToast('Settings reset to defaults', 'info')
  }

  const activateDnd = async () => {
    await apiFetch('/api/settings/dnd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: dndMinutes }),
    })
    setStatus(s => ({ ...s, dnd_active: true }))
    showToast(`DND active for ${dndMinutes} mins`, 'success')
  }

  const clearDnd = async () => {
    await apiFetch('/api/settings/dnd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 0 }),
    })
    setStatus(s => ({ ...s, dnd_active: false }))
    showToast('DND cleared', 'info')
  }

  const testVoice = async () => {
    setTestingVoice(true)
    try {
      await apiFetch('/api/settings/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      showToast('Voice test triggered', 'success')
    } catch { showToast('Voice test failed', 'error') }
    finally { setTestingVoice(false) }
  }

  const testNotif = async () => {
    setTestingNotif(true)
    try {
      await apiFetch('/api/settings/test-notification', { method: 'POST' })
      showToast('Test notification sent', 'success')
    } catch { showToast('Notification test failed', 'error') }
    finally { setTestingNotif(false) }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="font-orbitron text-[11px] tracking-widest" style={{ color: '#00d4ff' }}>
          LOADING SETTINGS...
        </div>
      </div>
    )
  }

  const hasDirty = Object.keys(dirty).length > 0

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Left sidebar — tab list */}
      <div style={{
        width: 220, flexShrink: 0, overflowY: 'auto',
        background: 'rgba(2,8,20,0.98)',
        borderRight: '1px solid rgba(0,212,255,0.1)',
        padding: '16px 8px',
      }}>
        <div className="px-3 mb-4">
          <div className="font-orbitron text-[11px] font-black tracking-[0.25em]" style={{ color: '#00d4ff' }}>SETTINGS</div>
          <div className="text-[8px] tracking-widest mt-0.5" style={{ color: 'rgba(168,216,234,0.3)' }}>JARVIS CONFIGURATION</div>
        </div>

        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-sm mb-0.5 transition-all text-left"
            style={{
              background: tab === t.id ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: `1px solid ${tab === t.id ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
              color: tab === t.id ? '#00d4ff' : 'rgba(168,216,234,0.45)',
            }}>
            <t.icon size={11} style={{ flexShrink: 0 }} />
            <span className="font-orbitron text-[8px] tracking-[0.1em]">{t.label}</span>
            {tab === t.id && <ChevronRight size={8} style={{ marginLeft: 'auto' }} />}
          </button>
        ))}

        {/* Save / Reset */}
        <div className="mt-4 space-y-2 px-2">
          <button onClick={save} disabled={saving || !hasDirty}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-sm font-orbitron text-[9px] tracking-widest transition-all"
            style={{
              background: hasDirty ? 'rgba(0,255,136,0.08)' : 'rgba(0,255,136,0.02)',
              border: `1px solid ${hasDirty ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.1)'}`,
              color: hasDirty ? '#00ff88' : 'rgba(0,255,136,0.25)',
            }}>
            <Save size={10} />
            {saving ? 'SAVING...' : hasDirty ? `SAVE CHANGES (${Object.keys(dirty).length})` : 'SAVED'}
          </button>
          <button onClick={reset}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-sm font-orbitron text-[9px] tracking-widest transition-all"
            style={{ background: 'transparent', border: '1px solid rgba(255,100,100,0.15)', color: 'rgba(255,100,100,0.4)' }}>
            <RotateCcw size={10} />
            RESET DEFAULTS
          </button>
        </div>
      </div>

      {/* Right panel — settings content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* ── Voice & Wake Word ───────────────────────────── */}
        {tab === 'voice' && (
          <div>
            <SectionHeader icon={Mic} title="VOICE & WAKE WORD" desc="Wake word detection, TTS voice, microphone sensitivity" />
            <div className="space-y-2">
              <Toggle value={settings.wake_word_enabled} onChange={v => change({ wake_word_enabled: v })}
                label="Wake Word Detection" desc="Listen for 'Jarvis' or 'Hey Jarvis' continuously" />
              <Toggle value={settings.jarvis_muted} onChange={v => change({ jarvis_muted: v })}
                label="Mute JARVIS Voice" desc="Disable text-to-speech output entirely" />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <Select label="TTS VOICE" value={settings.tts_voice}
                options={[
                  ['en-GB-RyanNeural', 'Ryan (British Male) — Default'],
                  ['en-US-GuyNeural', 'Guy (American Male)'],
                  ['en-GB-SoniaNeural', 'Sonia (British Female)'],
                  ['en-US-JennyNeural', 'Jenny (American Female)'],
                  ['en-AU-WilliamNeural', 'William (Australian Male)'],
                ]}
                onChange={v => change({ tts_voice: v })} />

              <Slider label="MIC SENSITIVITY (energy threshold)" value={settings.mic_sensitivity}
                min={50} max={1000} step={10} onChange={v => change({ mic_sensitivity: v })} />
              <Slider label="SPEECH RATE" value={settings.tts_rate}
                min={-50} max={50} unit="%" onChange={v => change({ tts_rate: v })} />
              <Slider label="SPEECH PITCH" value={settings.tts_pitch}
                min={-50} max={50} unit="Hz" onChange={v => change({ tts_pitch: v })} />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <div className="flex gap-3 flex-wrap">
                <ActionButton icon={Play} label="TEST VOICE" onClick={testVoice} loading={testingVoice} color="#00ff88" />
                <div className="flex items-center gap-2 px-3 py-2 rounded-sm"
                  style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.12)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: status.wake_word_running ? '#00ff88' : '#ff4444' }} />
                  <span className="font-orbitron text-[9px] tracking-wider" style={{ color: status.wake_word_running ? '#00ff88' : '#ff4444' }}>
                    {status.wake_word_running ? 'WAKE WORD ACTIVE' : 'WAKE WORD INACTIVE'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Proactivity & DND ────────────────────────────── */}
        {tab === 'proactive' && (
          <div>
            <SectionHeader icon={Bell} title="PROACTIVITY & DND" desc="How often JARVIS proactively checks in, reminders, quiet hours" />
            <div className="space-y-2">
              <Select label="PROACTIVITY LEVEL" value={settings.proactivity_level}
                options={[
                  ['off', 'Off — JARVIS is silent unless spoken to'],
                  ['minimal', 'Minimal — Critical alerts only'],
                  ['balanced', 'Balanced — Default'],
                  ['chatty', 'Chatty — Frequent check-ins'],
                ]}
                onChange={v => change({ proactivity_level: v })} />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <Toggle value={settings.eye_reminders_enabled} onChange={v => change({ eye_reminders_enabled: v })}
                label="Eye Break Reminders" desc="Remind you to look away from the screen" />
              <Slider label="EYE REMINDER — MIN INTERVAL" value={settings.eye_reminder_min_mins}
                min={20} max={120} unit=" min" onChange={v => change({ eye_reminder_min_mins: v })} />
              <Slider label="EYE REMINDER — MAX INTERVAL" value={settings.eye_reminder_max_mins}
                min={30} max={180} unit=" min" onChange={v => change({ eye_reminder_max_mins: v })} />
              <Slider label="BREAK INTERVAL" value={settings.break_interval_mins}
                min={30} max={240} unit=" min" onChange={v => change({ break_interval_mins: v })} />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <Toggle value={settings.work_mode_auto_dnd} onChange={v => change({ work_mode_auto_dnd: v })}
                label="Work Mode Auto-DND" desc="Silences notifications when in work/focus mode" />
              <Toggle value={settings.auto_mute_meetings} onChange={v => change({ auto_mute_meetings: v })}
                label="Auto-Mute During Meetings" desc="Permission required — mutes system audio when JARVIS detects Teams/Zoom/Discord/etc. Off by default." />
              <Toggle value={settings.quiet_hours_enabled} onChange={v => change({ quiet_hours_enabled: v })}
                label="Quiet Hours" desc="No notifications during specified hours" />
              {settings.quiet_hours_enabled && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <TextInput label="QUIET HOURS START" value={settings.quiet_hours_start}
                    onChange={v => change({ quiet_hours_start: v })} placeholder="22:00" />
                  <TextInput label="QUIET HOURS END" value={settings.quiet_hours_end}
                    onChange={v => change({ quiet_hours_end: v })} placeholder="07:00" />
                </div>
              )}

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              {/* Live DND control */}
              <div className="p-3 rounded-sm" style={{ background: 'rgba(4,15,30,0.7)', border: `1px solid ${status.dnd_active ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.12)'}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-orbitron text-[10px] tracking-wider" style={{ color: '#e8f4f8' }}>
                      DO NOT DISTURB (LIVE)
                    </div>
                    <div className="text-[8px] tracking-wide mt-0.5" style={{ color: 'rgba(168,216,234,0.4)' }}>
                      Immediately silence all proactive notifications
                    </div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.dnd_active ? '#00d4ff' : 'rgba(168,216,234,0.2)', animation: status.dnd_active ? 'statusPulse 2s ease-in-out infinite' : 'none' }} />
                </div>
                <div className="flex items-center gap-3">
                  <select value={dndMinutes} onChange={e => setDndMinutes(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-sm font-orbitron text-[9px] outline-none"
                    style={{ background: 'rgba(4,15,30,0.9)', border: '1px solid rgba(0,212,255,0.2)', color: '#e8f4f8' }}>
                    {[15, 30, 60, 120, 240, 480].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                  <ActionButton icon={BellOff} label="ACTIVATE DND" onClick={activateDnd} color="#00d4ff" />
                  {status.dnd_active && <ActionButton icon={Bell} label="CLEAR DND" onClick={clearDnd} color="#00ff88" />}
                </div>
              </div>

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Slider label="CPU ALERT %" value={settings.cpu_alert_threshold}
                    min={50} max={100} unit="%" onChange={v => change({ cpu_alert_threshold: v })} />
                </div>
                <div>
                  <Slider label="RAM ALERT %" value={settings.ram_alert_threshold}
                    min={50} max={100} unit="%" onChange={v => change({ ram_alert_threshold: v })} />
                </div>
                <div>
                  <Slider label="DISK ALERT %" value={settings.disk_alert_threshold}
                    min={50} max={100} unit="%" onChange={v => change({ disk_alert_threshold: v })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AI & Model ───────────────────────────────────── */}
        {tab === 'ai' && (
          <div>
            <SectionHeader icon={Cpu} title="AI & MODEL" desc="Groq model selection, response style, creativity" />
            <div className="space-y-2">
              <Select label="AI MODEL" value={settings.ai_model}
                options={[
                  ['llama-3.3-70b-versatile', 'Llama 3.3 70B Versatile — Default'],
                  ['llama-3.1-8b-instant', 'Llama 3.1 8B Instant — Fastest'],
                  ['mixtral-8x7b-32768', 'Mixtral 8x7B — Balanced'],
                ]}
                onChange={v => change({ ai_model: v })} />
              <Select label="RESPONSE STYLE" value={settings.response_style}
                options={[
                  ['concise', 'Concise — Short, punchy'],
                  ['balanced', 'Balanced — Default'],
                  ['detailed', 'Detailed — Full explanations'],
                  ['stark', 'Stark Mode — Tony Stark personality'],
                ]}
                onChange={v => change({ response_style: v })} />
              <Slider label="TEMPERATURE (creativity)" value={settings.temperature}
                min={0} max={1} step={0.05} onChange={v => change({ temperature: v })} />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <div className="p-3 rounded-sm" style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.12)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={10} style={{ color: 'rgba(255,180,0,0.7)' }} />
                  <span className="font-orbitron text-[9px] tracking-wider" style={{ color: 'rgba(255,180,0,0.7)' }}>API KEYS ARE IN .ENV FILE</span>
                </div>
                <p className="text-[9px] leading-relaxed" style={{ color: 'rgba(168,216,234,0.5)' }}>
                  Your GROQ_API_KEY and other secrets are stored in{' '}
                  <span className="font-mono" style={{ color: '#00d4ff' }}>backend/.env</span> and are not editable here
                  for security. Edit the .env file directly to change API keys.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Monitors ─────────────────────────────────────── */}
        {tab === 'monitors' && (
          <div>
            <SectionHeader icon={Activity} title="MONITORS" desc="Background intelligence modules — enable/disable each independently" />
            <div className="space-y-2">
              {[
                { key: 'context',   label: 'Context Monitor',       desc: 'Tracks active window + app context' },
                { key: 'clipboard', label: 'Clipboard Monitor',     desc: 'Watches clipboard for smart suggestions' },
                { key: 'network',   label: 'Network Guardian',      desc: 'Monitors connections + suspicious traffic' },
                { key: 'gaming',    label: 'Gaming Monitor',        desc: 'Detects games, enables gaming mode' },
                { key: 'meeting',   label: 'Meeting Assistant',     desc: 'Meeting detection + note-taking' },
                { key: 'terminal',  label: 'Terminal Assistant',    desc: 'Watches terminal for command suggestions' },
                { key: 'predictive',label: 'Predictive Engine',     desc: 'Learns patterns, predicts your next actions' },
                { key: 'ghost',     label: 'Parallel Task Ghost',   desc: 'Autonomous background task execution' },
              ].map(m => (
                <Toggle key={m.key} value={settings.monitors?.[m.key] ?? true}
                  onChange={v => changeMonitor(m.key, v)}
                  label={m.label} desc={m.desc} />
              ))}
            </div>
          </div>
        )}

        {/* ── Integrations ─────────────────────────────────── */}
        {tab === 'integrations' && (
          <div>
            <SectionHeader icon={Globe} title="INTEGRATIONS" desc="Connect JARVIS to your external tools" />
            <div className="space-y-2">
              <TextInput label="OBSIDIAN VAULT PATH" value={settings.obsidian_vault_path}
                onChange={v => change({ obsidian_vault_path: v })}
                placeholder="C:\\Users\\you\\Documents\\MyVault" />
              <TextInput label="NTFY PUSH TOPIC" value={settings.ntfy_push_topic}
                onChange={v => change({ ntfy_push_topic: v })}
                placeholder="jarvis-push" />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <ActionButton icon={TestTube} label="TEST PUSH NOTIFICATION" onClick={testNotif} loading={testingNotif} />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <div className="p-3 rounded-sm" style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.12)' }}>
                <div className="font-orbitron text-[9px] tracking-wider mb-2" style={{ color: 'rgba(168,216,234,0.6)' }}>
                  CONFIGURED VIA .ENV
                </div>
                {[
                  ['GROQ_API_KEY', 'Groq AI (LLM)'],
                  ['OPENWEATHERMAP_API_KEY', 'Weather data'],
                  ['NTFY_URL', 'Push notifications server'],
                  ['PHONE_IP', 'iPhone/Android bridge'],
                ].map(([k, desc]) => (
                  <div key={k} className="flex items-center justify-between py-1.5 border-b"
                    style={{ borderColor: 'rgba(0,212,255,0.06)' }}>
                    <span className="font-mono text-[9px]" style={{ color: '#00d4ff' }}>{k}</span>
                    <span className="text-[8px]" style={{ color: 'rgba(168,216,234,0.4)' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Appearance ───────────────────────────────────── */}
        {tab === 'appearance' && (
          <div>
            <SectionHeader icon={Palette} title="APPEARANCE" desc="HUD aesthetic, animations, accent color" />
            <div className="space-y-2">
              <div className="py-2">
                <label className="text-[9px] font-orbitron tracking-wider block mb-2" style={{ color: 'rgba(168,216,234,0.6)' }}>
                  ACCENT COLOR
                </label>
                <div className="flex items-center gap-3">
                  <input type="color" value={settings.accent_color}
                    onChange={e => change({ accent_color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-none outline-none"
                    style={{ background: 'transparent' }} />
                  <span className="font-mono text-[11px]" style={{ color: settings.accent_color }}>
                    {settings.accent_color}
                  </span>
                  <button onClick={() => change({ accent_color: '#00d4ff' })}
                    className="px-2 py-1 rounded-sm font-orbitron text-[8px] tracking-wider"
                    style={{ border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(168,216,234,0.4)' }}>
                    RESET
                  </button>
                </div>
              </div>

              <Select label="ANIMATION INTENSITY" value={settings.animation_intensity}
                options={[
                  ['full', 'Full — Particles, streams, waveform, glitch'],
                  ['reduced', 'Reduced — Minimal motion'],
                  ['off', 'Off — No animations (performance mode)'],
                ]}
                onChange={v => change({ animation_intensity: v })} />

              <Select label="UI DENSITY" value={settings.ui_density}
                options={[
                  ['comfortable', 'Comfortable — Default spacing'],
                  ['compact', 'Compact — Tighter layout'],
                ]}
                onChange={v => change({ ui_density: v })} />

              <Select label="TEXT SIZE" value={settings.text_size || 'default'}
                options={[
                  ['compact', 'Compact — Smaller text'],
                  ['default', 'Default — Standard size'],
                  ['large', 'Large — Easier to read'],
                  ['xl', 'Extra Large — Maximum readability'],
                ]}
                onChange={v => { change({ text_size: v }); setTextSize(v) }} />

              <Toggle value={settings.glitch_effects} onChange={v => change({ glitch_effects: v })}
                label="Glitch Effects on Critical Alerts" desc="Matrix-style glitch overlay on high-priority events" />
              <Toggle value={settings.boot_screen} onChange={v => change({ boot_screen: v })}
                label="Boot Screen on Startup" desc="Show JARVIS startup animation when launching" />
              <Toggle value={settings.ui_sound_effects} onChange={v => { change({ ui_sound_effects: v }); setSoundEnabled(v) }}
                label="UI Sound Effects" desc="Subtle beeps/ticks on nav, hover, alerts, and approvals" />
            </div>
          </div>
        )}

        {/* ── Startup & System ─────────────────────────────── */}
        {tab === 'startup' && (
          <div>
            <SectionHeader icon={Zap} title="STARTUP & SYSTEM" desc="Auto-launch, minimize behavior, system integration" />
            <div className="space-y-2">
              <Toggle value={settings.launch_on_login} onChange={v => change({ launch_on_login: v })}
                label="Launch JARVIS on Login" desc="Start JARVIS automatically when Windows starts" />
              <Toggle value={settings.start_minimized} onChange={v => change({ start_minimized: v })}
                label="Start Minimized" desc="Open to system tray instead of full window" />

              <div className="h-px my-4" style={{ background: 'rgba(0,212,255,0.08)' }} />

              <div className="p-3 rounded-sm" style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.12)' }}>
                <div className="font-orbitron text-[9px] tracking-widest mb-3" style={{ color: 'rgba(0,212,255,0.6)' }}>
                  SYSTEM STATUS
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Backend', 'Running on :8000', '#00ff88'],
                    ['AI Engine', 'Groq / Llama-3.3', '#00d4ff'],
                    ['Database', 'SQLite (aiosqlite)', '#00d4ff'],
                    ['Wake Word', status.wake_word_running ? 'Active' : 'Inactive', status.wake_word_running ? '#00ff88' : '#ff6464'],
                    ['DND', status.dnd_active ? 'Active' : 'Off', status.dnd_active ? '#00d4ff' : 'rgba(168,216,234,0.4)'],
                    ['Work Mode', status.work_mode ? 'Active' : 'Off', status.work_mode ? '#00ff88' : 'rgba(168,216,234,0.4)'],
                  ].map(([k, v, c]) => (
                    <div key={k} className="flex items-center justify-between px-2 py-1.5 rounded-sm"
                      style={{ background: 'rgba(2,8,20,0.7)', border: '1px solid rgba(0,212,255,0.08)' }}>
                      <span className="font-orbitron text-[8px] tracking-wider" style={{ color: 'rgba(168,216,234,0.5)' }}>{k}</span>
                      <span className="font-orbitron text-[8px] tracking-wider" style={{ color: c as string }}>{v as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Data & Privacy ───────────────────────────────── */}
        {tab === 'privacy' && (
          <div>
            <SectionHeader icon={Lock} title="DATA & PRIVACY" desc="What JARVIS stores, local-only processing" />
            <div className="space-y-3">
              {[
                { icon: '🔒', title: 'Everything runs locally', body: 'JARVIS backend runs on your machine. No cloud servers receive your data — conversations, files, and monitoring data never leave your PC.' },
                { icon: '🧠', title: 'AI via Groq API', body: 'Conversation messages are sent to Groq\'s API (llama-3.3-70b) for AI responses. Groq\'s privacy policy applies. No personally identifying data is automatically included.' },
                { icon: '📁', title: 'Stored data', body: 'Chat history, task logs, and settings are stored in SQLite (jarvis.db) and JSON files in the backend/ directory. You can delete these at any time.' },
                { icon: '🎤', title: 'Microphone', body: 'Wake word detection uses your microphone. Audio is processed locally using Google Speech Recognition (sent to Google only when a wake word is detected). The mic is not recorded.' },
                { icon: '📋', title: 'Clipboard monitoring', body: 'Clipboard content is read locally to provide smart context. It is not sent anywhere unless you explicitly ask JARVIS to act on it.' },
              ].map(({ icon, title, body }) => (
                <div key={title} className="p-3 rounded-sm" style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.1)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span>{icon}</span>
                    <span className="font-orbitron text-[9px] tracking-wider" style={{ color: '#e8f4f8' }}>{title}</span>
                  </div>
                  <p className="text-[9px] leading-relaxed" style={{ color: 'rgba(168,216,234,0.55)' }}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Threat Matrix (full embed) ────────────────────── */}
        {tab === 'threat' && (
          <div style={{ height: 'calc(100vh - 80px)', margin: '-24px -28px' }}>
            <ThreatMatrix />
          </div>
        )}

        {/* ── Command Deck (full embed) ─────────────────────── */}
        {tab === 'deck' && (
          <div style={{ height: 'calc(100vh - 80px)', margin: '-24px -28px' }}>
            <CommandDeck />
          </div>
        )}

        {/* ── Tool Registry (full embed) ────────────────────── */}
        {tab === 'tools' && (
          <div style={{ margin: '-24px -28px' }}>
            <Tools />
          </div>
        )}

        {/* ── Audit Logs (full embed) ───────────────────────── */}
        {tab === 'logs' && (
          <div style={{ margin: '-24px -28px' }}>
            <Logs />
          </div>
        )}

        {/* ── Advanced (embedded link) ─────────────────────── */}
        {tab === 'advanced' && (
          <div>
            <SectionHeader icon={Sliders} title="ADVANCED FEATURES" desc="8 advanced AI modules" />
            <EmbedLink to="/advanced" label="Open Advanced Features" icon={Sliders}
              desc="Context awareness, predictive engine, meeting assistant, gaming mode, terminal AI, and more" />
          </div>
        )}

        {/* ── Help & Commands (full embed) ──────────────────── */}
        {tab === 'help' && (
          <div style={{ margin: '-24px -28px' }}>
            <Help />
          </div>
        )}

        {/* ── About ────────────────────────────────────────── */}
        {tab === 'about' && (
          <div>
            <SectionHeader icon={Info} title="ABOUT JARVIS" desc="System information" />
            <div className="space-y-3">
              <div className="p-4 rounded-sm text-center" style={{ background: 'rgba(4,15,30,0.7)', border: '1px solid rgba(0,212,255,0.15)' }}>
                <div className="font-orbitron text-2xl font-black tracking-[0.4em] glow-text mb-1">JARVIS</div>
                <div className="font-orbitron text-[9px] tracking-[0.3em] mb-3" style={{ color: 'rgba(168,216,234,0.5)' }}>
                  JUST A RATHER VERY INTELLIGENT SYSTEM
                </div>
                <div className="font-orbitron text-[10px] tracking-widest" style={{ color: '#00ff88' }}>v1.0.0</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Frontend', 'React + Vite + Tailwind + Electron'],
                  ['Backend', 'FastAPI + asyncio + SQLite'],
                  ['AI Engine', 'Groq (Llama 3.3 70B)'],
                  ['Voice', 'Edge TTS + SpeechRecognition'],
                  ['Architecture', 'SSE streaming, WebSockets'],
                  ['Monitoring', '9 background intelligence modules'],
                ].map(([k, v]) => (
                  <div key={k} className="p-2 rounded-sm" style={{ background: 'rgba(4,15,30,0.6)', border: '1px solid rgba(0,212,255,0.08)' }}>
                    <div className="font-orbitron text-[8px] tracking-wider mb-0.5" style={{ color: 'rgba(0,212,255,0.5)' }}>{k}</div>
                    <div className="text-[9px]" style={{ color: 'rgba(168,216,234,0.7)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

// ── Embedded link card ────────────────────────────────────────────
function EmbedLink({ to, label, icon: Icon, desc }: any) {
  return (
    <div>
      <div className="p-4 rounded-sm mb-4" style={{ background: 'rgba(4,15,30,0.7)', border: '1px solid rgba(0,212,255,0.15)' }}>
        <div className="flex items-center gap-3 mb-3">
          <Icon size={18} style={{ color: '#00d4ff' }} />
          <div className="font-orbitron text-[11px] tracking-wider" style={{ color: '#e8f4f8' }}>{label}</div>
        </div>
        <p className="text-[9px] leading-relaxed mb-4" style={{ color: 'rgba(168,216,234,0.55)' }}>{desc}</p>
        <a href={`#${to}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-sm font-orbitron text-[9px] tracking-widest transition-all"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>
          <ChevronRight size={10} />
          {label.toUpperCase()}
        </a>
      </div>
      <div className="p-3 rounded-sm" style={{ background: 'rgba(4,15,30,0.5)', border: '1px solid rgba(0,212,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Info size={9} style={{ color: 'rgba(168,216,234,0.3)' }} />
          <span className="font-orbitron text-[8px] tracking-wider" style={{ color: 'rgba(168,216,234,0.3)' }}>
            SETTINGS INTEGRATION NOTE
          </span>
        </div>
        <p className="text-[8px] leading-relaxed" style={{ color: 'rgba(168,216,234,0.35)' }}>
          This section links to the dedicated tab. Configuration controls that belong here are accessible from both
          this Settings panel and the dedicated tab. Any changes made there are reflected here automatically.
        </p>
      </div>
    </div>
  )
}
