/**
 * Lightweight synthesized HUD sound effects (Web Audio API — no audio assets).
 * All sounds are short, quiet "sci-fi UI" blips.
 */

let enabled = true
let ctx: AudioContext | null = null

export function setSoundEnabled(v: boolean) {
  enabled = v
}

export function isSoundEnabled() {
  return enabled
}

function getCtx(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

interface ToneOpts {
  freq: number
  duration: number
  type?: OscillatorType
  volume?: number
  delay?: number
  endFreq?: number
}

function tone({ freq, duration, type = 'sine', volume = 0.05, delay = 0, endFreq }: ToneOpts) {
  const audio = getCtx()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, audio.currentTime + delay)
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, audio.currentTime + delay + duration)
  }
  gain.gain.setValueAtTime(volume, audio.currentTime + delay)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + duration)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(audio.currentTime + delay)
  osc.stop(audio.currentTime + delay + duration)
}

/** Quick tick — navigation / button clicks */
export function playClick() {
  tone({ freq: 1400, duration: 0.05, type: 'square', volume: 0.025 })
}

/** Barely-there tick — hover */
export function playHover() {
  tone({ freq: 2200, duration: 0.02, type: 'sine', volume: 0.012 })
}

/** Two-tone chime — incoming notification/toast */
export function playNotification() {
  tone({ freq: 880, duration: 0.09, type: 'sine', volume: 0.045 })
  tone({ freq: 1320, duration: 0.12, type: 'sine', volume: 0.04, delay: 0.07 })
}

/** Rising sweep — approval confirmed / success */
export function playConfirm() {
  tone({ freq: 520, endFreq: 1100, duration: 0.16, type: 'triangle', volume: 0.05 })
}

/** Falling buzz — approval denied / error */
export function playDeny() {
  tone({ freq: 420, endFreq: 160, duration: 0.2, type: 'sawtooth', volume: 0.04 })
}

/** Sharp double-blip — alert / threat detected */
export function playAlert() {
  tone({ freq: 1000, duration: 0.07, type: 'square', volume: 0.05 })
  tone({ freq: 1000, duration: 0.07, type: 'square', volume: 0.05, delay: 0.12 })
}
