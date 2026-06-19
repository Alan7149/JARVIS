import { apiFetch } from '../lib/api'
import { useEffect, useState } from 'react'
import { Shield, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'
import clsx from 'clsx'

interface Tool {
  name: string
  description: string
  permission_level: number
  permission_name: string
}

const LEVEL_CONFIG = {
  1: { label: 'READ ONLY', icon: Shield, color: 'text-jarvis-glow', border: 'border-jarvis-glow/20', bg: 'bg-jarvis-glow/5' },
  2: { label: 'SAFE ACTION', icon: ShieldCheck, color: 'text-jarvis-success', border: 'border-jarvis-success/20', bg: 'bg-jarvis-success/5' },
  3: { label: 'NEEDS APPROVAL', icon: ShieldAlert, color: 'text-jarvis-warn', border: 'border-jarvis-warn/20', bg: 'bg-jarvis-warn/5' },
  4: { label: 'BLOCKED', icon: ShieldOff, color: 'text-jarvis-danger', border: 'border-jarvis-danger/20', bg: 'bg-jarvis-danger/5' },
}

export default function Tools() {
  const [tools, setTools] = useState<Tool[]>([])
  const [filter, setFilter] = useState<number | null>(null)

  useEffect(() => {
    apiFetch('/api/tools/').then(r => r.json()).then(setTools)
  }, [])

  const filtered = filter ? tools.filter(t => t.permission_level === filter) : tools

  const counts = [1, 2, 3, 4].map(level => ({
    level,
    count: tools.filter(t => t.permission_level === level).length,
    ...LEVEL_CONFIG[level as keyof typeof LEVEL_CONFIG],
  }))

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold tracking-widest glow-text">TOOL REGISTRY</h1>

      {/* Level filter buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setFilter(null)}
          className={clsx('px-3 py-2 rounded border text-[10px] tracking-widest transition-all',
            filter === null
              ? 'border-jarvis-glow text-jarvis-glow bg-jarvis-glow/10'
              : 'border-jarvis-border text-jarvis-muted hover:border-jarvis-text'
          )}
        >
          ALL ({tools.length})
        </button>
        {counts.map(({ level, count, label, color, border }) => {
          const Icon = LEVEL_CONFIG[level as keyof typeof LEVEL_CONFIG].icon
          return (
            <button
              key={level}
              onClick={() => setFilter(filter === level ? null : level)}
              className={clsx('px-3 py-2 rounded border text-[10px] tracking-widest transition-all flex items-center gap-1.5',
                filter === level ? `${color} bg-opacity-10 ${border}` : 'border-jarvis-border text-jarvis-muted hover:border-jarvis-text'
              )}
            >
              <Icon size={10} className={filter === level ? color : ''} />
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Tool cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(tool => {
          const config = LEVEL_CONFIG[tool.permission_level as keyof typeof LEVEL_CONFIG]
          const Icon = config.icon
          return (
            <div key={tool.name} className={clsx('panel p-4', config.border)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="font-mono text-sm text-jarvis-glow">{tool.name}</div>
                  <div className="text-[11px] text-jarvis-muted mt-1 leading-relaxed">{tool.description}</div>
                </div>
                <div className={clsx('flex items-center gap-1 text-[9px] tracking-widest whitespace-nowrap', config.color)}>
                  <Icon size={10} />
                  {config.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
