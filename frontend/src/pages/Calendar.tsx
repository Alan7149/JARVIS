import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Clock, CalendarDays } from 'lucide-react'

type Ev = { id: string; title: string; date: string; time?: string; notes?: string; color?: string }

const COLORS = ['#00d4ff', '#00ff88', '#ff9900', '#ff3333', '#a855f7', '#00aaff']
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function Calendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [events, setEvents] = useState<Ev[]>([])
  const [form, setForm] = useState<{ open: boolean; date: string; title: string; time: string; notes: string; color: string }>({ open: false, date: ymd(new Date()), title: '', time: '', notes: '', color: COLORS[0] })

  const load = () => apiFetch('/api/calendar/events').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {})
  useEffect(() => { load() }, [])

  const todayStr = ymd(new Date())
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first); start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [cursor])

  const byDay = useMemo(() => { const m: Record<string, Ev[]> = {}; for (const e of events) (m[e.date] ||= []).push(e); return m }, [events])

  const upcoming = useMemo(() => events.filter(e => e.date >= todayStr).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 12), [events, todayStr])

  const openAdd = (date: string) => setForm({ open: true, date, title: '', time: '', notes: '', color: COLORS[0] })
  const addEvent = async () => {
    if (!form.title.trim()) return
    await apiFetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, date: form.date, time: form.time, notes: form.notes, color: form.color }) })
    setForm(f => ({ ...f, open: false })); load()
  }
  const del = async (id: string) => { await apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE' }); load() }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron flex items-center gap-2"><CalendarDays size={20} /> CALENDAR</h1>
          <p className="text-[10px] text-jarvis-muted mt-1">{events.length} events · click any day to add</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="text-[9px] px-3 py-1.5 rounded-sm font-orbitron" style={{ border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff' }}>TODAY</button>
          <button onClick={() => openAdd(todayStr)} className="flex items-center gap-1.5 btn-primary text-[9px]"><Plus size={11} /> NEW EVENT</button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ minHeight: 460 }}>
        {/* Month grid */}
        <div className="lg:col-span-3 panel hud-corner p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="p-1.5 rounded-sm" style={{ border: '1px solid rgba(13,74,110,0.4)', color: '#00d4ff' }}><ChevronLeft size={14} /></button>
            <div className="font-orbitron text-sm tracking-widest" style={{ color: '#a8d8ea' }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
            <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="p-1.5 rounded-sm" style={{ border: '1px solid rgba(13,74,110,0.4)', color: '#00d4ff' }}><ChevronRight size={14} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map(d => <div key={d} className="text-center text-[8px] font-orbitron tracking-widest" style={{ color: '#4a7a99' }}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 flex-1">
            {grid.map((d, i) => {
              const k = ymd(d); const inMonth = d.getMonth() === cursor.getMonth(); const isToday = k === todayStr; const evs = byDay[k] || []
              return (
                <button key={i} onClick={() => openAdd(k)} className="text-left rounded-sm p-1 flex flex-col transition-all hover:brightness-125"
                  style={{ background: isToday ? 'rgba(0,212,255,0.1)' : 'rgba(4,22,40,0.4)', border: `1px solid ${isToday ? 'rgba(0,212,255,0.5)' : 'rgba(13,74,110,0.25)'}`, opacity: inMonth ? 1 : 0.4, minHeight: 62 }}>
                  <span className="text-[9px] font-mono" style={{ color: isToday ? '#00d4ff' : '#a8d8ea' }}>{d.getDate()}</span>
                  <div className="flex-1 space-y-0.5 overflow-hidden mt-0.5">
                    {evs.slice(0, 3).map(e => (
                      <div key={e.id} className="text-[7px] truncate px-1 rounded-sm leading-tight" style={{ background: `${e.color}22`, color: e.color, borderLeft: `2px solid ${e.color}` }}>{e.time ? e.time + ' ' : ''}{e.title}</div>
                    ))}
                    {evs.length > 3 && <div className="text-[7px]" style={{ color: '#4a7a99' }}>+{evs.length - 3} more</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Agenda */}
        <div className="panel hud-corner p-4 overflow-y-auto">
          <div className="label-jarvis mb-3 flex items-center gap-1"><Clock size={11} /> UPCOMING</div>
          <div className="space-y-1.5">
            {upcoming.length === 0 && <div className="text-[9px] text-jarvis-muted text-center py-6">Nothing scheduled. Click a day to add an event.</div>}
            {upcoming.map(e => (
              <div key={e.id} className="group p-2 rounded-sm" style={{ background: 'rgba(4,22,40,0.5)', border: `1px solid ${e.color}33`, borderLeft: `3px solid ${e.color}` }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-medium" style={{ color: '#a8d8ea' }}>{e.title}</span>
                  <button onClick={() => del(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#ff6464' }}><Trash2 size={11} /></button>
                </div>
                <div className="text-[8px] text-jarvis-muted">{new Date(e.date + 'T00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{e.time ? ` · ${e.time}` : ''}</div>
                {e.notes && <div className="text-[8px] text-jarvis-muted/80 mt-0.5">{e.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add modal */}
      {form.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,8,18,0.8)' }} onClick={() => setForm(f => ({ ...f, open: false }))}>
          <div className="panel hud-corner w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><span className="font-orbitron text-sm" style={{ color: '#00d4ff' }}>NEW EVENT</span><button onClick={() => setForm(f => ({ ...f, open: false }))} className="text-jarvis-muted hover:text-jarvis-text"><X size={15} /></button></div>
            <input className="input-jarvis" placeholder="Event title…" autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addEvent()} />
            <div className="flex gap-2">
              <div className="flex-1"><label className="label-jarvis">Date</label><input type="date" className="input-jarvis" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="w-28"><label className="label-jarvis">Time</label><input type="time" className="input-jarvis" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} /></div>
            </div>
            <div><label className="label-jarvis">Notes</label><textarea className="input-jarvis resize-none" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div>
              <label className="label-jarvis">Colour</label>
              <div className="flex gap-2">{COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className="w-6 h-6 rounded-full" style={{ background: c, border: form.color === c ? '2px solid #fff' : '2px solid transparent', boxShadow: `0 0 6px ${c}` }} />)}</div>
            </div>
            <div className="flex gap-2 pt-1"><button onClick={addEvent} className="btn-primary text-[10px] flex-1">ADD EVENT</button><button onClick={() => setForm(f => ({ ...f, open: false }))} className="btn-danger text-[10px]">CANCEL</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
