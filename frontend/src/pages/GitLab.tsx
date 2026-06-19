import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { GitMerge, GitCommit, Upload, GitBranch, FolderGit2, RefreshCw, ExternalLink, KeyRound, CheckCircle, AlertCircle, Star } from 'lucide-react'

function ago(iso?: string) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const KIND = {
  push: { icon: Upload, color: '#00ff88' },
  merge: { icon: GitMerge, color: '#a855f7' },
  issue: { icon: AlertCircle, color: '#ff9900' },
  other: { icon: GitCommit, color: '#00d4ff' },
} as const

export default function GitLab() {
  const [status, setStatus] = useState<any>(null)
  const [activity, setActivity] = useState<any[]>([])
  const [mrs, setMrs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [host, setHost] = useState('https://gitlab.com')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadStatus = () => apiFetch('/api/gitlab/status').then(r => r.json()).then(s => { setStatus(s); if (s.host) setHost(s.host); return s })
  const loadAll = async () => {
    setLoading(true)
    try {
      const [a, m, p] = await Promise.all([
        apiFetch('/api/gitlab/activity').then(r => r.json()),
        apiFetch('/api/gitlab/merge-requests').then(r => r.json()),
        apiFetch('/api/gitlab/projects').then(r => r.json()),
      ])
      setActivity(a.events || []); setMrs(m.merge_requests || []); setProjects(p.projects || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadStatus().then(s => { if (s.configured) loadAll() }) }, [])

  const save = async () => {
    setSaving(true)
    const s = await apiFetch('/api/gitlab/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, token }) }).then(r => r.json())
    setStatus(s); setSaving(false); setToken('')
    if (s.configured) loadAll()
  }

  const projName = (id: number) => projects.find(p => p.id === id)?.path || ''

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-widest glow-text font-orbitron flex items-center gap-2"><FolderGit2 size={20} /> GITLAB</h1>
          <p className="text-[10px] text-jarvis-muted mt-1">
            {status?.configured ? <>Connected as <b style={{ color: '#fc6d26' }}>{status.user?.name}</b> · @{status.user?.username}</> : 'Connect your GitLab to see merges, commits & pushes'}
          </p>
        </div>
        {status?.configured && <button onClick={() => { loadStatus(); loadAll() }} className="flex items-center gap-1.5 btn-primary text-[9px]"><RefreshCw size={11} style={loading ? { animation: 'arcSpin1 0.8s linear infinite' } : {}} /> REFRESH</button>}
      </div>

      {!status?.configured ? (
        <div className="panel hud-corner p-5 max-w-xl space-y-3">
          <div className="flex items-center gap-2 mb-1"><KeyRound size={14} style={{ color: '#fc6d26' }} /><span className="text-[10px] font-orbitron tracking-widest">CONNECT GITLAB</span></div>
          <div>
            <label className="label-jarvis">GitLab Host</label>
            <input className="input-jarvis" value={host} onChange={e => setHost(e.target.value)} placeholder="https://gitlab.com" />
          </div>
          <div>
            <label className="label-jarvis">Personal Access Token</label>
            <input className="input-jarvis font-mono" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="glpat-••••••••••••" />
            <div className="text-[8px] text-jarvis-muted mt-1">
              Create one with <b style={{ color: '#00d4ff' }}>read_api</b> scope at{' '}
              <a className="underline" style={{ color: '#fc6d26' }} target="_blank" rel="noreferrer" href={`${host}/-/user_settings/personal_access_tokens`}>{host}/-/user_settings/personal_access_tokens</a>.
              Stored locally on this machine only — never uploaded.
            </div>
          </div>
          {status?.error && <div className="text-[9px]" style={{ color: '#ff6464' }}>✗ {status.error}</div>}
          <button onClick={save} disabled={saving || !token} className="btn-primary text-[10px]">{saving ? 'CONNECTING…' : 'CONNECT'}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Activity feed */}
          <div className="lg:col-span-2 space-y-4">
            <div className="panel hud-corner p-4">
              <div className="label-jarvis mb-3 flex items-center gap-1"><GitCommit size={11} /> RECENT ACTIVITY</div>
              <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
                {activity.length === 0 && <div className="text-[9px] text-jarvis-muted text-center py-6">No recent activity.</div>}
                {activity.map((e, i) => {
                  const k = (KIND as any)[e.kind] || KIND.other; const Icon = k.icon
                  return (
                    <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-sm" style={{ background: 'rgba(4,22,40,0.5)', border: '1px solid rgba(13,74,110,0.3)' }}>
                      <Icon size={12} style={{ color: k.color, marginTop: 1, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px]" style={{ color: '#a8d8ea' }}><span style={{ color: k.color }}>{e.action}</span> {e.detail}</div>
                        <div className="text-[8px] text-jarvis-muted">{e.author}{projName(e.project_id) ? ` · ${projName(e.project_id)}` : ''} · {ago(e.created_at)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Merge requests */}
            <div className="panel hud-corner p-4">
              <div className="label-jarvis mb-3 flex items-center gap-1" style={{ color: '#a855f7' }}><GitMerge size={11} /> OPEN MERGE REQUESTS · {mrs.length}</div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {mrs.length === 0 && <div className="text-[9px] text-jarvis-muted text-center py-4">No open merge requests.</div>}
                {mrs.map((m, i) => (
                  <a key={i} href={m.web_url} target="_blank" rel="noreferrer" className="block p-2 rounded-sm hover:brightness-125" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px]" style={{ color: '#c8b0f0' }}>{m.draft && <span style={{ color: '#ff9900' }}>[Draft] </span>}{m.title}</span>
                      <ExternalLink size={9} className="flex-shrink-0 mt-0.5" style={{ color: '#4a7a99' }} />
                    </div>
                    <div className="flex items-center gap-1 text-[8px] text-jarvis-muted mt-1"><GitBranch size={8} />{m.source} → {m.target} · {m.author} · {ago(m.updated_at)}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Projects */}
          <div className="panel hud-corner p-4">
            <div className="label-jarvis mb-3 flex items-center gap-1"><FolderGit2 size={11} /> PROJECTS · {projects.length}</div>
            <div className="space-y-1.5 max-h-[560px] overflow-y-auto">
              {projects.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noreferrer" className="block p-2 rounded-sm hover:brightness-125" style={{ background: 'rgba(4,22,40,0.5)', border: '1px solid rgba(13,74,110,0.3)' }}>
                  <div className="flex items-center justify-between"><span className="text-[10px] font-mono truncate" style={{ color: '#a8d8ea' }}>{p.name}</span>{p.stars > 0 && <span className="flex items-center gap-0.5 text-[8px]" style={{ color: '#ff9900' }}><Star size={8} />{p.stars}</span>}</div>
                  <div className="text-[8px] text-jarvis-muted truncate">{p.path}</div>
                  <div className="text-[7px] text-jarvis-muted mt-0.5">active {ago(p.last_activity)}</div>
                </a>
              ))}
            </div>
            <button onClick={() => { setStatus({ ...status, configured: false }) }} className="w-full mt-3 flex items-center justify-center gap-1 text-[8px] py-1.5 rounded-sm" style={{ border: '1px solid rgba(13,74,110,0.4)', color: '#4a7a99' }}><KeyRound size={9} /> RECONNECT / CHANGE TOKEN</button>
          </div>
        </div>
      )}
    </div>
  )
}
