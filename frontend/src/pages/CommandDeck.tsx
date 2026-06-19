// @ts-nocheck
import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { apiFetch } from '../lib/api'
import { Terminal, Zap, Cpu, Search, Cloud, Database, GitBranch, HardDrive, Activity, ChevronRight, Clock, CheckCircle, XCircle, Loader, CornerDownLeft } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────
interface Phase {
  step: string
  label: string
  status: 'idle' | 'active' | 'done' | 'error'
}

interface ToolCall {
  name: string
  input: Record<string, any>
  result?: string
  error?: string
  status: 'running' | 'done' | 'error'
}

interface DeckEntry {
  id: number
  command: string
  timestamp: string
  phases: Phase[]
  toolCall: ToolCall | null
  response: string
  elapsed: number | null
  streaming: boolean
  logs: string[]
}

const PHASE_ORDER = ['intake', 'parse', 'tool', 'compose']

const PHASE_LABELS: Record<string, string> = {
  intake: 'RECEIVING',
  parse: 'PARSING INTENT',
  tool: 'EXECUTING TOOL',
  compose: 'COMPOSING',
}

const TOOL_ICONS: Record<string, any> = {
  get_weather: Cloud,
  web_search: Search,
  get_system_status: Cpu,
  get_disk_usage: HardDrive,
  get_running_processes: Activity,
  search_documents: Database,
  get_git_status: GitBranch,
}

const SUGGESTIONS = [
  "What's the current weather?",
  "How is my CPU and RAM doing?",
  "Search for latest AI news",
  "Check my git repos status",
  "How much disk space do I have?",
  "What processes are using the most CPU?",
]

let _nextId = 1
const nextId = () => _nextId++

// ── Phase indicator strip ──────────────────────────────────────────
function PhaseStrip({ phases, hasToolPhase }: { phases: Phase[]; hasToolPhase: boolean }) {
  const steps = hasToolPhase ? PHASE_ORDER : PHASE_ORDER.filter(s => s !== 'tool')

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => {
        const ph = phases.find(p => p.step === step)
        const status = ph?.status ?? 'idle'
        const label = ph?.label ?? PHASE_LABELS[step] ?? step.toUpperCase()

        const color = status === 'done' ? '#00ff88'
          : status === 'active' ? '#00d4ff'
          : status === 'error' ? '#ff4444'
          : 'rgba(168,216,234,0.2)'

        return (
          <div key={step} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm font-orbitron text-[8px] tracking-widest transition-all duration-300"
              style={{
                background: status === 'idle' ? 'transparent' : `${color}12`,
                border: `1px solid ${color}40`,
                color: color,
              }}>
              {status === 'active' && (
                <Loader size={8} style={{ animation: 'spin 1s linear infinite' }} />
              )}
              {status === 'done' && <CheckCircle size={8} />}
              {status === 'error' && <XCircle size={8} />}
              {status === 'idle' && <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />}
              <span>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight size={8} style={{ color: 'rgba(168,216,234,0.2)', flexShrink: 0 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tool call card ─────────────────────────────────────────────────
function ToolCard({ tool }: { tool: ToolCall }) {
  const Icon = TOOL_ICONS[tool.name] ?? Zap
  const color = tool.status === 'done' ? '#00ff88' : tool.status === 'error' ? '#ff4444' : '#00d4ff'

  return (
    <div className="rounded-sm p-2 mt-2 font-mono text-[10px]"
      style={{ background: 'rgba(0,212,255,0.04)', border: `1px solid ${color}30` }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={10} style={{ color }} />
        <span style={{ color }} className="font-orbitron tracking-wider text-[9px]">
          {tool.name.replace(/_/g, ' ').toUpperCase()}
        </span>
        {tool.status === 'running' && (
          <Loader size={8} style={{ color, animation: 'spin 1s linear infinite', marginLeft: 'auto' }} />
        )}
        {tool.status === 'done' && (
          <CheckCircle size={8} style={{ color: '#00ff88', marginLeft: 'auto' }} />
        )}
        {tool.status === 'error' && (
          <XCircle size={8} style={{ color: '#ff4444', marginLeft: 'auto' }} />
        )}
      </div>
      {/* Input args */}
      {Object.keys(tool.input).length > 0 && (
        <div className="mb-1.5 pl-2 border-l-2" style={{ borderColor: `${color}30` }}>
          {Object.entries(tool.input).map(([k, v]) => (
            <div key={k} className="text-[9px]" style={{ color: 'rgba(168,216,234,0.5)' }}>
              <span style={{ color: 'rgba(0,212,255,0.6)' }}>{k}</span>
              {': '}
              <span>{String(v).slice(0, 80)}</span>
            </div>
          ))}
        </div>
      )}
      {/* Result */}
      {tool.result && (
        <div className="text-[9px] pl-2 border-l-2 py-1"
          style={{ borderColor: 'rgba(0,255,136,0.3)', color: 'rgba(168,216,234,0.7)', maxHeight: 80, overflowY: 'auto' }}>
          {tool.result.slice(0, 400)}{tool.result.length > 400 ? '…' : ''}
        </div>
      )}
      {tool.error && (
        <div className="text-[9px] pl-2 border-l-2 py-1"
          style={{ borderColor: 'rgba(255,68,68,0.4)', color: '#ff7777' }}>
          {tool.error}
        </div>
      )}
    </div>
  )
}

// ── Single history entry ───────────────────────────────────────────
function DeckEntryCard({ entry }: { entry: DeckEntry }) {
  const hasToolPhase = entry.phases.some(p => p.step === 'tool') || entry.toolCall !== null

  return (
    <div className="mb-4 rounded" style={{ background: 'rgba(4,15,30,0.8)', border: '1px solid rgba(0,212,255,0.12)' }}>
      {/* Command header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'rgba(0,212,255,0.1)' }}>
        <ChevronRight size={12} style={{ color: '#00d4ff' }} />
        <span className="flex-1 font-mono text-[11px]" style={{ color: '#e8f4f8' }}>
          {entry.command}
        </span>
        <div className="flex items-center gap-1.5 text-[8px] font-orbitron" style={{ color: 'rgba(168,216,234,0.4)' }}>
          <Clock size={8} />
          {entry.timestamp}
          {entry.elapsed !== null && (
            <span style={{ color: '#00ff88' }}>— {entry.elapsed}s</span>
          )}
        </div>
      </div>

      {/* Phase strip */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(0,212,255,0.08)' }}>
        <PhaseStrip phases={entry.phases} hasToolPhase={hasToolPhase} />
      </div>

      {/* Logs (collapsible) */}
      {entry.logs.length > 0 && (
        <div className="px-3 py-1.5 border-b" style={{ borderColor: 'rgba(0,212,255,0.06)' }}>
          {entry.logs.map((log, i) => (
            <div key={i} className="text-[9px] font-mono" style={{ color: 'rgba(168,216,234,0.4)' }}>
              <span style={{ color: 'rgba(0,212,255,0.3)' }}>›</span> {log}
            </div>
          ))}
        </div>
      )}

      {/* Tool call */}
      {entry.toolCall && (
        <div className="px-3 pb-0">
          <ToolCard tool={entry.toolCall} />
        </div>
      )}

      {/* Response */}
      {entry.response && (
        <div className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Terminal size={10} style={{ color: '#00d4ff', marginTop: 2, flexShrink: 0 }} />
            <p className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
              style={{ color: 'rgba(232,244,248,0.9)' }}>
              {entry.response}
              {entry.streaming && (
                <span style={{
                  display: 'inline-block', width: 2, height: 12,
                  background: '#00d4ff', marginLeft: 2, verticalAlign: 'middle',
                  animation: 'statusPulse 0.8s ease-in-out infinite',
                }} />
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────
export default function CommandDeck() {
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<DeckEntry[]>([])
  const [running, setRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeIdRef = useRef<number | null>(null)

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const updateEntry = (id: number, patch: Partial<DeckEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  const patchPhase = (id: number, step: string, status: Phase['status'], label?: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e
      const existing = e.phases.find(p => p.step === step)
      if (existing) {
        return { ...e, phases: e.phases.map(p => p.step === step ? { ...p, status, ...(label ? { label } : {}) } : p) }
      }
      return { ...e, phases: [...e.phases, { step, label: label ?? PHASE_LABELS[step] ?? step, status }] }
    }))
  }

  const run = async () => {
    const text = input.trim()
    if (!text || running) return
    setInput('')
    setRunning(true)

    const id = nextId()
    activeIdRef.current = id
    const entry: DeckEntry = {
      id,
      command: text,
      timestamp: new Date().toLocaleTimeString(),
      phases: [],
      toolCall: null,
      response: '',
      elapsed: null,
      streaming: false,
      logs: [],
    }
    setEntries(prev => [...prev, entry])

    try {
      const res = await apiFetch('/api/deck/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (raw === '[DONE]') break
          try {
            const event = JSON.parse(raw)
            const { type, data } = event

            if (type === 'phase') {
              patchPhase(id, data.step, data.status, data.label)

            } else if (type === 'log') {
              setEntries(prev => prev.map(e =>
                e.id === id ? { ...e, logs: [...e.logs, data] } : e
              ))

            } else if (type === 'tool_call') {
              setEntries(prev => prev.map(e =>
                e.id === id ? { ...e, toolCall: { name: data.name, input: data.input, status: 'running' } } : e
              ))

            } else if (type === 'tool_result') {
              setEntries(prev => prev.map(e =>
                e.id === id && e.toolCall
                  ? { ...e, toolCall: { ...e.toolCall, result: data.result, status: 'done' } }
                  : e
              ))

            } else if (type === 'tool_error') {
              setEntries(prev => prev.map(e =>
                e.id === id && e.toolCall
                  ? { ...e, toolCall: { ...e.toolCall, error: data.error, status: 'error' } }
                  : e
              ))

            } else if (type === 'text') {
              setEntries(prev => prev.map(e =>
                e.id === id
                  ? { ...e, response: e.response + data, streaming: true }
                  : e
              ))

            } else if (type === 'done') {
              setEntries(prev => prev.map(e =>
                e.id === id
                  ? { ...e, elapsed: data.elapsed, streaming: false }
                  : e
              ))

            } else if (type === 'error') {
              setEntries(prev => prev.map(e =>
                e.id === id
                  ? { ...e, response: `Error: ${data}`, streaming: false }
                  : e
              ))
            }
          } catch {}
        }
      }
    } catch (err) {
      setEntries(prev => prev.map(e =>
        e.id === id ? { ...e, response: `Connection error: ${err}`, streaming: false } : e
      ))
    } finally {
      setRunning(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      run()
    }
  }

  const clear = () => { setEntries([]) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', gap: 16 }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-lg font-black tracking-[0.3em] glow-text">COMMAND DECK</h1>
          <p className="text-[9px] font-orbitron tracking-[0.2em] mt-0.5" style={{ color: 'rgba(168,216,234,0.5)' }}>
            LIVE REASONING TERMINAL — WATCH JARVIS THINK IN REAL TIME
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm font-orbitron text-[8px] tracking-widest"
            style={{
              background: running ? 'rgba(0,212,255,0.08)' : 'rgba(0,255,136,0.06)',
              border: `1px solid ${running ? 'rgba(0,212,255,0.3)' : 'rgba(0,255,136,0.2)'}`,
              color: running ? '#00d4ff' : '#00ff88',
            }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: running ? '#00d4ff' : '#00ff88',
              animation: running ? 'statusPulse 0.8s ease-in-out infinite' : 'none',
            }} />
            {running ? 'PROCESSING' : 'READY'}
          </div>
          {entries.length > 0 && (
            <button onClick={clear}
              className="px-3 py-1.5 font-orbitron text-[8px] tracking-widest rounded-sm transition-all"
              style={{ border: '1px solid rgba(255,100,100,0.2)', color: 'rgba(255,100,100,0.5)' }}
              onMouseEnter={e => { (e.target as any).style.borderColor = 'rgba(255,100,100,0.5)'; (e.target as any).style.color = '#ff6464' }}
              onMouseLeave={e => { (e.target as any).style.borderColor = 'rgba(255,100,100,0.2)'; (e.target as any).style.color = 'rgba(255,100,100,0.5)' }}>
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Suggestions (shown when no history) */}
      {entries.length === 0 && (
        <div>
          <div className="text-[8px] font-orbitron tracking-[0.2em] mb-2" style={{ color: 'rgba(168,216,234,0.35)' }}>
            SUGGESTED COMMANDS
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }}
                className="px-3 py-1.5 rounded-sm font-mono text-[10px] transition-all"
                style={{ background: 'rgba(4,22,40,0.7)', border: '1px solid rgba(0,212,255,0.15)', color: 'rgba(168,216,234,0.6)' }}
                onMouseEnter={e => { (e.target as any).style.borderColor = 'rgba(0,212,255,0.4)'; (e.target as any).style.color = '#e8f4f8' }}
                onMouseLeave={e => { (e.target as any).style.borderColor = 'rgba(0,212,255,0.15)'; (e.target as any).style.color = 'rgba(168,216,234,0.6)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {entries.map(entry => (
          <DeckEntryCard key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="rounded" style={{
        background: 'rgba(4,15,30,0.95)',
        border: `1px solid ${running ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.2)'}`,
        boxShadow: running ? '0 0 20px rgba(0,212,255,0.08)' : 'none',
        transition: 'all 0.3s ease',
      }}>
        {/* Prompt line */}
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="flex items-center gap-1 pt-1 flex-shrink-0">
            <span className="font-orbitron text-[10px]" style={{ color: '#00d4ff' }}>JARVIS</span>
            <ChevronRight size={10} style={{ color: '#00d4ff' }} />
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={running}
            rows={1}
            placeholder="Issue a command or ask anything… (Enter to execute, Shift+Enter for newline)"
            className="flex-1 bg-transparent resize-none outline-none font-mono text-[11px] leading-relaxed"
            style={{
              color: running ? 'rgba(232,244,248,0.4)' : '#e8f4f8',
              caretColor: '#00d4ff',
              minHeight: 24,
              maxHeight: 120,
            }}
          />
          <button onClick={run} disabled={!input.trim() || running}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-orbitron text-[8px] tracking-widest transition-all mt-0.5"
            style={{
              background: (input.trim() && !running) ? 'rgba(0,212,255,0.12)' : 'rgba(0,212,255,0.03)',
              border: `1px solid ${(input.trim() && !running) ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.1)'}`,
              color: (input.trim() && !running) ? '#00d4ff' : 'rgba(0,212,255,0.3)',
            }}>
            {running ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <CornerDownLeft size={10} />}
            {running ? 'RUNNING' : 'EXECUTE'}
          </button>
        </div>

        {/* Footer hint */}
        <div className="px-4 pb-2 flex items-center gap-4">
          <span className="text-[8px] font-orbitron tracking-wider" style={{ color: 'rgba(168,216,234,0.2)' }}>
            ENTER TO RUN
          </span>
          <span className="text-[8px] font-orbitron tracking-wider" style={{ color: 'rgba(168,216,234,0.2)' }}>
            SHIFT+ENTER FOR NEWLINE
          </span>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(0,212,255,0.1), transparent)' }} />
          <span className="text-[8px] font-orbitron tracking-wider" style={{ color: 'rgba(0,212,255,0.3)' }}>
            GROQ / LLAMA-3.3-70B
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
