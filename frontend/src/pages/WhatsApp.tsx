import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useWebSocket } from '../contexts/WebSocketContext'
import { MessageCircle, Send, RefreshCw, QrCode } from 'lucide-react'

interface WaMessage {
  id: string; from: string; phone: string; body: string
  timestamp: number; isGroup: boolean; chatName: string; time: string
}
interface WaStatus { ready: boolean; error?: string; qrPending?: boolean }

export default function WhatsAppPage() {
  const { lastMessage } = useWebSocket()
  const [status, setStatus] = useState<WaStatus>({ ready: false })
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [qr, setQr] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')
  const [searchQ, setSearchQ] = useState('')

  const load = async () => {
    const s = await apiFetch('/api/whatsapp/status').then(r => r.json()).catch(() => ({ ready: false }))
    setStatus(s)
    if (!s.ready) {
      const q = await apiFetch('/api/whatsapp/qr').then(r => r.json()).catch(() => ({}))
      setQr(q.qr || null)
    }
    const m = await apiFetch(`/api/whatsapp/messages?limit=30${searchQ ? `&q=${searchQ}` : ''}`).then(r => r.json()).catch(() => [])
    if (Array.isArray(m)) setMessages(m)
  }

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (lastMessage?.event === 'whatsapp_event') {
      const ev = (lastMessage.data as any)
      if (ev?.event === 'whatsapp_message') {
        setMessages(prev => [ev.data, ...prev].slice(0, 50))
      }
    }
  }, [lastMessage])

  const sendMessage = async () => {
    if (!to || !msg) return
    setSending(true)
    setSendResult('')
    try {
      const endpoint = to.match(/^\+?[\d\s-]+$/) ? '/api/whatsapp/send' : '/api/whatsapp/send-by-name'
      const payload = to.match(/^\+?[\d\s-]+$/)
        ? { to: to.replace(/[^\d]/g, ''), message: msg }
        : { name: to, message: msg }
      const result = await apiFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())
      setSendResult(result.sent ? `✓ Sent to ${result.to}` : `✗ ${result.error}`)
      if (result.sent) { setMsg(''); setTimeout(() => setSendResult(''), 3000) }
    } catch (e: any) { setSendResult(`✗ ${e.message}`) }
    setSending(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron flex items-center gap-2">
            <MessageCircle size={20} /> WHATSAPP
          </h1>
          <p className="text-[10px] text-jarvis-muted mt-1">Read & send messages via JARVIS</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[9px] font-orbitron px-3 py-1.5 rounded-sm"
            style={{ background: status.ready ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)', border: `1px solid ${status.ready ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,51,0.3)'}`, color: status.ready ? '#00ff88' : '#ff3333' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: status.ready ? '#00ff88' : '#ff3333', animation: 'statusPulse 2s ease-in-out infinite' }} />
            {status.ready ? 'CONNECTED' : 'DISCONNECTED'}
          </div>
          <button onClick={load} className="btn-primary text-[9px] flex items-center gap-1">
            <RefreshCw size={10} /> REFRESH
          </button>
        </div>
      </div>

      {!status.ready && (
        <div className="panel hud-corner p-5">
          <div className="flex items-center gap-2 mb-3">
            <QrCode size={14} style={{ color: '#ff9900' }} />
            <span className="text-[10px] font-orbitron tracking-widest text-jarvis-warn">WHATSAPP NOT CONNECTED</span>
          </div>
          {status.error ? (
            <div className="space-y-3">
              <p className="text-[11px] text-jarvis-muted">{status.error}</p>
              <div className="px-3 py-2 rounded-sm text-[10px] font-mono" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}>
                cd path\to\JARVIS<br/>
                .\start-whatsapp.ps1
              </div>
              <p className="text-[10px] text-jarvis-muted">Run the command above in a terminal, then scan the QR code with your iPhone WhatsApp → Linked Devices → Link a Device</p>
            </div>
          ) : qr ? (
            <div className="text-center">
              <p className="text-[11px] text-jarvis-muted mb-3">Scan this QR code with WhatsApp on your iPhone</p>
              <div className="inline-block p-4 bg-white rounded-lg">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`} alt="QR" width={200} height={200} />
              </div>
              <p className="text-[9px] text-jarvis-muted mt-2">WhatsApp → ⋮ → Linked Devices → Link a Device</p>
            </div>
          ) : (
            <p className="text-[11px] text-jarvis-muted">Starting WhatsApp service...</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Send message */}
        <div className="panel hud-corner p-4 space-y-3">
          <div className="text-[10px] font-orbitron tracking-widest text-jarvis-muted flex items-center gap-2">
            <Send size={11} /> SEND MESSAGE
          </div>
          <input className="input-jarvis" placeholder="Contact name or phone number (+91...)"
            value={to} onChange={e => setTo(e.target.value)} />
          <textarea className="input-jarvis resize-none" rows={3}
            placeholder="Your message..."
            value={msg} onChange={e => setMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} />
          <div className="flex items-center gap-3">
            <button onClick={sendMessage} disabled={sending || !status.ready}
              className="btn-primary flex items-center gap-2 text-[10px]">
              <Send size={10} /> {sending ? 'SENDING...' : 'SEND'}
            </button>
            {sendResult && (
              <span className="text-[9px] font-mono" style={{ color: sendResult.startsWith('✓') ? '#00ff88' : '#ff3333' }}>
                {sendResult}
              </span>
            )}
          </div>
          <p className="text-[8px] text-jarvis-muted">
            Voice: "JARVIS, send WhatsApp to Mom saying I'll be home by 8"<br/>
            "@JARVIS [message]" in any WhatsApp chat to invoke AI
          </p>
        </div>

        {/* Message feed */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-orbitron tracking-widest text-jarvis-muted flex-1">INCOMING MESSAGES</div>
            <input className="input-jarvis text-[10px] w-32 py-1" placeholder="Filter..."
              value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-[10px] text-jarvis-muted py-4 text-center">
                {status.ready ? 'No messages yet' : 'Connect WhatsApp to see messages'}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className="p-3 rounded-sm cursor-pointer group"
                style={{ background: 'rgba(4,22,40,0.6)', border: '1px solid rgba(13,74,110,0.3)' }}
                onClick={() => setTo(m.from)}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-semibold" style={{ color: '#00d4ff' }}>
                    {m.from}{m.isGroup && <span className="text-[8px] text-jarvis-muted ml-1">({m.chatName})</span>}
                  </span>
                  <span className="text-[8px] text-jarvis-muted">{m.time}</span>
                </div>
                <p className="text-[10px] text-jarvis-text">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
