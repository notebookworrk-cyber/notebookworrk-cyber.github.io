import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ThemeDef {
  id: string
  name: string
  note: string
  swatch: string
}

export const THEMES: ThemeDef[] = [
  { id: 'paper', name: 'Paper', note: 'Warm newsprint', swatch: '#f5f2ea' },
  { id: 'ink', name: 'Ink', note: 'Charcoal', swatch: '#121211' },
  { id: 'system', name: 'System', note: 'Follows your device', swatch: 'linear-gradient(135deg,#f5f2ea 50%,#121211 50%)' },
]

interface UIState {
  theme: string
  sidebarOpen: boolean
  onboarded: boolean
  setTheme: (theme: string) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setOnboarded: (value: boolean) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: 'paper',
      sidebarOpen: false,
      onboarded: false,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: 'meridian:ui' },
  ),
)

export function applyTheme(id: string): void {
  const valid = THEMES.some((t) => t.id === id) ? id : 'paper'
  const resolved =
    valid === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'ink'
        : 'paper'
      : valid
  document.documentElement.setAttribute('data-theme', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'ink' ? '#121211' : '#f5f2ea')
}
