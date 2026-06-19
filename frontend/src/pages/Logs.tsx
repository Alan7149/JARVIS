import { apiFetch } from '../lib/api'
import { useEffect, useState } from 'react'
import { RefreshCw, Filter } from 'lucide-react'
import clsx from 'clsx'

interface LogEntry {
  id: number
  tool_name: string
  device: string
  requester: string
  approval_status: string
  success: boolean
  timestamp: string
  result_preview: string
}

const APPROVAL_COLORS: Record<string, string> = {
  auto: 'text-jarvis-glow',
  approved: 'text-jarvis-success',
  denied: 'text-jarvis-danger',
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const data = await apiFetch('/api/logs/?limit=200').then(r => r.json())
    setLogs(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = logs.filter(l =>
    !filter || l.tool_name.includes(filter) || l.device.includes(filter) || l.approval_status.includes(filter)
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-widest glow-text">AUDIT LOGS</h1>
        <button onClick={load} className="btn-primary flex items-center gap-2">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Filter size={13} className="text-jarvis-muted" />
        <input
          className="input-jarvis max-w-xs"
          placeholder="Filter by tool, device..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="text-xs text-jarvis-muted">{filtered.length} entries</span>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-jarvis-border text-[10px] text-jarvis-muted tracking-widest">
              <th className="text-left p-3">TIMESTAMP</th>
              <th className="text-left p-3">TOOL</th>
              <th className="text-left p-3">DEVICE</th>
              <th className="text-left p-3">APPROVAL</th>
              <th className="text-left p-3">STATUS</th>
              <th className="text-left p-3 w-64">RESULT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id} className="border-b border-jarvis-border/30 hover:bg-jarvis-border/10 transition-colors">
                <td className="p-3 text-jarvis-muted whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="p-3 text-jarvis-glow font-mono">{log.tool_name}</td>
                <td className="p-3 text-jarvis-text">{log.device}</td>
                <td className={clsx('p-3 font-semibold tracking-wider', APPROVAL_COLORS[log.approval_status] || 'text-jarvis-text')}>
                  {log.approval_status.toUpperCase()}
                </td>
                <td className="p-3">
                  <span className={log.success ? 'text-jarvis-success' : 'text-jarvis-danger'}>
                    {log.success ? '✓ OK' : '✗ FAIL'}
                  </span>
                </td>
                <td className="p-3 text-jarvis-muted truncate max-w-xs">{log.result_preview}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-jarvis-muted">No log entries.</div>
        )}
      </div>
    </div>
  )
}
