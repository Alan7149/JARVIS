/**
 * Global UI text scaling.
 *
 * The whole app uses fixed-px font sizes inside a full-viewport,
 * overflow:hidden layout. Bumping individual font sizes would reflow and break
 * dozens of pixel-tuned panels. Instead we scale the entire #root uniformly
 * with CSS `zoom`, and shrink the root's box by the same factor so it scales
 * back to exactly the viewport — i.e. it reflows like real browser zoom rather
 * than overflowing. Net effect: text (and everything) gets proportionally
 * larger/more legible with NO layout breakage.
 *
 * Requires the Layout root to size at 100%/100% (not 100vw/100vh) so it follows
 * the compensated #root box instead of the raw viewport.
 */

export type TextSize = 'compact' | 'default' | 'large' | 'xl'

const FACTORS: Record<TextSize, number> = {
  compact: 0.92,
  default: 1.0,
  large: 1.12,
  xl: 1.24,
}

export function setTextSize(size: TextSize | string | undefined) {
  const root = document.getElementById('root')
  if (!root) return
  const f = FACTORS[(size as TextSize)] ?? 1.0

  if (f === 1.0) {
    // Revert to the CSS defaults (#root { width:100%; height:100% })
    root.style.zoom = ''
    root.style.width = ''
    root.style.height = ''
    return
  }

  // @ts-ignore — `zoom` is a valid Chromium/Electron CSS property
  root.style.zoom = String(f)
  root.style.width = `calc(100vw / ${f})`
  root.style.height = `calc(100vh / ${f})`
}
