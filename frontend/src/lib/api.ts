// Backend runs on HTTP port 8000
// file:// → Electron installed app → needs absolute URL
// localhost:5173 → dev server → Vite proxy handles /api → localhost:8000
const isFile = window.location.protocol === 'file:'
export const BASE = isFile ? 'http://localhost:8000' : ''

export function apiUrl(path: string): string {
  return `${BASE}${path}`
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), options)
}
