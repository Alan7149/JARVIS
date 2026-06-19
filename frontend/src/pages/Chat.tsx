import { apiFetch } from '../lib/api'
import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send, Mic, MicOff, Trash2, CheckCircle, XCircle, AlertCircle, ChevronRight, Clock, Plus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { useJarvisState } from '../contexts/JarvisStateContext'
import { playConfirm, playDeny } from '../lib/sounds'

interface HistorySession {
  id: number
  session_id: string
  title: string
  device: string
  message_count: number
  updated_at: string
}

interface Message {
  id: number
  role: 'user' | 'jarvis' | 'system'
  content: string
  timestamp: string
}

interface ApprovalRequest {
  tool_use_id: string
  tool_name: string
  parameters: Record<string, unknown>
  conversation_id: string
}

let msgId = 0
const nextId = () => ++msgId

const PERMISSION_LABEL: Record<string, string> = {
  READ_ONLY: 'READ ONLY',
  SAFE_ACTION: 'SAFE ACTION',
  REQUIRES_CONFIRMATION: 'NEEDS APPROVAL',
  BLOCKED: 'BLOCKED',
}

const GREETING: Message = {
  id: 0,
  role: 'jarvis',
  content: "Good day. I am JARVIS — Just A Rather Very Intelligent System. All systems are online and ready. How may I assist you?",
  timestamp: new Date().toLocaleTimeString(),
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([])
  const [toolActivity, setToolActivity] = useState<string[]>([])
  const [history, setHistory] = useState<HistorySession[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { setProcessing } = useJarvisState()

  // Load chat history
  const loadHistory = () => {
    apiFetch('/api/chat/sessions?limit=30').then(r => r.json()).then(setHistory).catch(() => {})
  }

  useEffect(() => { loadHistory() }, [])

  const newConversation = () => {
    setMessages([GREETING])
    setConversationId(null)
    setPendingApprovals([])
    setToolActivity([])
  }

  const loadSession = async (session: HistorySession) => {
    try {
      const msgs = await apiFetch(`/api/chat/sessions/${session.session_id}/messages`).then(r => r.json())
      const loaded: Message[] = msgs.map((m: any) => ({
        id: nextId(),
        role: m.role === 'user' ? 'user' : 'jarvis',
        content: m.content,
        timestamp: new Date(m.created_at).toLocaleTimeString(),
      }))
      setMessages(loaded.length ? loaded : [GREETING])
      setConversationId(session.session_id)
      setShowHistory(false)
    } catch {}
  }

  const deleteSession = async (e: React.MouseEvent, session_id: string) => {
    e.stopPropagation()
    await apiFetch(`/api/chat/sessions/${session_id}`, { method: 'DELETE' })
    loadHistory()
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolActivity])

  const appendMessage = (role: Message['role'], content: string) => {
    setMessages(prev => [...prev, {
      id: nextId(),
      role,
      content,
      timestamp: new Date().toLocaleTimeString(),
    }])
  }

  const send = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    appendMessage('user', text)
    setIsLoading(true)
    setProcessing(true)
    setToolActivity([])

    let jarvisBuffer = ''
    let jarvisMsgId: number | null = null

    try {
      const res = await apiFetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversation_id: conversationId }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') break
          try {
            const event = JSON.parse(data)
            if (event.type === 'conversation_id') {
              setConversationId(event.data)
            } else if (event.type === 'text') {
              jarvisBuffer += event.data
              if (jarvisMsgId === null) {
                jarvisMsgId = nextId()
                setMessages(prev => [...prev, {
                  id: jarvisMsgId!,
                  role: 'jarvis',
                  content: jarvisBuffer,
                  timestamp: new Date().toLocaleTimeString(),
                }])
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === jarvisMsgId ? { ...m, content: jarvisBuffer } : m
                ))
              }
            } else if (event.type === 'tool_call') {
              setToolActivity(prev => [...prev, `→ ${event.data.name}`])
            } else if (event.type === 'tool_result') {
              setToolActivity(prev => [...prev, `✓ ${event.data.name}`])
            } else if (event.type === 'tool_error') {
              setToolActivity(prev => [...prev, `✗ ${event.data.name}: ${event.data.error}`])
            } else if (event.type === 'approval_required') {
              setPendingApprovals(prev => [...prev, { ...event.data, conversation_id: conversationId! }])
            }
          } catch {}
        }
      }
    } catch (e) {
      appendMessage('system', `Connection error: ${e}`)
    } finally {
      setIsLoading(false)
      setProcessing(false)
      setToolActivity([])
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleApproval = async (approval: ApprovalRequest, approved: boolean) => {
    approved ? playConfirm() : playDeny()
    setPendingApprovals(prev => prev.filter(a => a.tool_use_id !== approval.tool_use_id))
    try {
      const res = await apiFetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...approval, approved }),
      })
      const data = await res.json()
      if (data.result) {
        appendMessage('system', `${approved ? '✓ Executed' : '✗ Denied'}: ${approval.tool_name}\n\n${data.result}`)
      }
    } catch (e) {
      appendMessage('system', `Approval error: ${e}`)
    }
  }

  const clearConversation = () => {
    setMessages([{
      id: nextId(),
      role: 'jarvis',
      content: "Conversation cleared. Ready for new instructions.",
      timestamp: new Date().toLocaleTimeString(),
    }])
    setConversationId(null)
    setPendingApprovals([])
  }

  return (
    <div className="flex h-full">

      {/* History sidebar */}
      {showHistory && (
        <div className="w-64 flex-shrink-0 border-r border-jarvis-border flex flex-col"
          style={{ background: 'rgba(2,8,20,0.95)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-jarvis-border">
            <span className="text-[10px] font-orbitron tracking-widest" style={{ color: '#00d4ff' }}>HISTORY</span>
            <button onClick={() => { loadHistory(); setShowHistory(false) }}
              className="text-jarvis-muted hover:text-jarvis-danger text-[9px]">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {history.length === 0 && (
              <p className="text-[10px] text-jarvis-muted p-2">No saved conversations yet.</p>
            )}
            {history.map(s => (
              <div key={s.session_id}
                onClick={() => loadSession(s)}
                className="group flex items-start justify-between gap-2 p-2 rounded-sm cursor-pointer transition-all"
                style={{ border: '1px solid transparent' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-jarvis-text truncate">{s.title || 'Untitled'}</div>
                  <div className="text-[8px] text-jarvis-muted mt-0.5">
                    {s.message_count} msgs · {new Date(s.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={e => deleteSession(e, s.session_id)}
                  className="opacity-0 group-hover:opacity-100 text-jarvis-muted hover:text-jarvis-danger transition-all flex-shrink-0">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-jarvis-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { setShowHistory(s => !s); if (!showHistory) loadHistory() }}
            className="flex items-center gap-1.5 text-[10px] font-orbitron tracking-wider px-2 py-1.5 rounded-sm transition-all"
            style={{
              background: showHistory ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: `1px solid ${showHistory ? 'rgba(0,212,255,0.3)' : 'rgba(13,74,110,0.4)'}`,
              color: showHistory ? '#00d4ff' : '#4a7a99',
            }}>
            <Clock size={10} /> HISTORY
          </button>
          <button onClick={newConversation}
            className="flex items-center gap-1.5 text-[10px] font-orbitron tracking-wider px-2 py-1.5 rounded-sm transition-all"
            style={{ border: '1px solid rgba(13,74,110,0.4)', color: '#4a7a99' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a7a99'; e.currentTarget.style.borderColor = 'rgba(13,74,110,0.4)' }}
          >
            <Plus size={10} /> NEW
          </button>
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-widest glow-text text-right">JARVIS INTERFACE</h1>
          {conversationId && (
            <p className="text-[9px] text-jarvis-muted mt-0.5 font-mono text-right">SESSION: {conversationId.slice(0, 8).toUpperCase()}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Tool activity */}
        {toolActivity.length > 0 && (
          <div className="panel p-3 border-jarvis-glow/20">
            <div className="text-[10px] text-jarvis-muted tracking-widest mb-2">EXECUTING</div>
            {toolActivity.map((t, i) => (
              <div key={i} className="text-xs text-jarvis-glow font-mono flex items-center gap-2">
                <ChevronRight size={10} /> {t}
              </div>
            ))}
          </div>
        )}

        {/* Loading indicator with waveform */}
        {isLoading && toolActivity.length === 0 && (
          <div className="flex items-center gap-4">
            {/* Arc reactor pulse */}
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              <svg width="32" height="32" style={{ position: 'absolute' }}>
                <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="2"/>
                <circle cx="16" cy="16" r="12" fill="none" stroke="#00d4ff" strokeWidth="2"
                  strokeDasharray="75" strokeDashoffset="0"
                  style={{ animation: 'spin1 1.2s linear infinite', transformOrigin: '16px 16px', filter: 'drop-shadow(0 0 4px #00d4ff)' }}/>
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4ff',
                  boxShadow: '0 0 8px #00d4ff', animation: 'statusPulse 1s ease-in-out infinite' }} />
              </div>
            </div>
            {/* Mini waveform bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 20 }}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{
                  width: 3, borderRadius: 2,
                  background: '#00d4ff',
                  boxShadow: '0 0 4px rgba(0,212,255,0.5)',
                  animation: `waveBar${i % 3} 0.6s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                  height: 4 + Math.abs(Math.sin(i * 1.2)) * 16,
                }} />
              ))}
            </div>
            <span className="text-xs tracking-widest font-orbitron" style={{ color: '#00d4ff' }}>
              JARVIS THINKING...
            </span>
          </div>
        )}

        {/* Approval requests */}
        {pendingApprovals.map(approval => (
          <ApprovalCard key={approval.tool_use_id} approval={approval} onDecide={handleApproval} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-jarvis-border">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Give JARVIS an instruction... (Enter to send, Shift+Enter for new line)"
              disabled={isLoading}
              rows={2}
              className="input-jarvis resize-none leading-relaxed"
            />
          </div>
          <button
            onClick={send}
            disabled={isLoading || !input.trim()}
            className={clsx(
              'p-3 rounded border transition-all duration-200',
              isLoading || !input.trim()
                ? 'border-jarvis-border text-jarvis-muted cursor-not-allowed'
                : 'border-jarvis-glow text-jarvis-glow hover:bg-jarvis-glow hover:text-jarvis-bg shadow-glow-sm'
            )}
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[9px] text-jarvis-muted mt-2 tracking-wider">
          ENTER — SEND &nbsp;|&nbsp; SHIFT+ENTER — NEW LINE &nbsp;|&nbsp; ALL ACTIONS LOGGED
        </p>
      </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%]">
          <div className="text-[10px] text-jarvis-muted text-right mb-1 tracking-widest">YOU — {msg.timestamp}</div>
          <div className="bg-jarvis-glow/10 border border-jarvis-glow/30 rounded px-4 py-3 text-sm text-jarvis-text">
            {msg.content}
          </div>
        </div>
      </div>
    )
  }

  if (msg.role === 'system') {
    return (
      <div className="panel p-3 border-jarvis-warn/20">
        <div className="text-[10px] text-jarvis-warn tracking-widest mb-1 flex items-center gap-1">
          <AlertCircle size={10} /> SYSTEM
        </div>
        <pre className="text-xs text-jarvis-text whitespace-pre-wrap font-mono">{msg.content}</pre>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full border border-jarvis-glow/50 flex items-center justify-center flex-shrink-0 mt-1"
           style={{ boxShadow: '0 0 8px rgba(0,212,255,0.3)' }}>
        <span className="text-[9px] glow-text font-bold">J</span>
      </div>
      <div className="flex-1">
        <div className="text-[10px] text-jarvis-muted mb-1 tracking-widest">JARVIS — {msg.timestamp}</div>
        <div className="panel px-4 py-3 text-sm prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { className?: string }) => {
                const isBlock = className?.startsWith('language-')
                return isBlock ? (
                  <pre className="bg-jarvis-bg border border-jarvis-border rounded p-3 overflow-x-auto">
                    <code className={`text-jarvis-glow text-xs font-mono ${className}`} {...props}>{children}</code>
                  </pre>
                ) : (
                  <code className="bg-jarvis-bg px-1.5 py-0.5 rounded text-jarvis-glow text-xs" {...props}>{children}</code>
                )
              },
              p: ({ children }) => <p className="text-jarvis-text mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="text-jarvis-text list-disc list-inside space-y-1 mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="text-jarvis-text list-decimal list-inside space-y-1 mb-2">{children}</ol>,
              strong: ({ children }) => <strong className="text-jarvis-glow font-semibold">{children}</strong>,
              h1: ({ children }) => <h1 className="text-jarvis-glow text-base font-bold mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-jarvis-accent text-sm font-bold mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-jarvis-text text-sm font-semibold mb-1">{children}</h3>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function ApprovalCard({ approval, onDecide }: {
  approval: ApprovalRequest
  onDecide: (a: ApprovalRequest, approved: boolean) => void
}) {
  return (
    <div className="panel p-4 border-jarvis-warn/30 shadow-glow-warn">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={14} className="text-jarvis-warn" />
        <span className="text-xs text-jarvis-warn tracking-widest font-semibold">APPROVAL REQUIRED</span>
      </div>
      <div className="mb-3">
        <div className="label-jarvis">TOOL</div>
        <div className="text-sm text-jarvis-glow font-mono">{approval.tool_name}</div>
      </div>
      <div className="mb-4">
        <div className="label-jarvis">PARAMETERS</div>
        <pre className="text-xs text-jarvis-text bg-jarvis-bg rounded p-2 overflow-x-auto border border-jarvis-border">
          {JSON.stringify(approval.parameters, null, 2)}
        </pre>
      </div>
      <div className="flex gap-3">
        <button onClick={() => onDecide(approval, true)} className="btn-success flex items-center gap-2">
          <CheckCircle size={12} /> AUTHORIZE
        </button>
        <button onClick={() => onDecide(approval, false)} className="btn-danger flex items-center gap-2">
          <XCircle size={12} /> DENY
        </button>
      </div>
    </div>
  )
}
