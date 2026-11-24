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
  { id: 'ink', name: 'Ink', note: 'Graphite', swatch: '#121211' },
  { id: 'system', name: 'System', note: 'Follows your device', swatch: 'linear-gradient(135deg,#f5f2ea 50%,#121211 50%)' },
]

export interface AccentDef {
  id: string
  name: string
  light: string
  dark: string
}

export const ACCENTS: AccentDef[] = [
  { id: 'vermilion', name: 'Vermilion', light: '#d6401f', dark: '#ff5a3c' },
  { id: 'brass', name: 'Brass', light: '#9a7420', dark: '#d0a44f' },
  { id: 'indigo', name: 'Indigo', light: '#3e5c76', dark: '#8ab4dc' },
  { id: 'moss', name: 'Moss', light: '#3f6b4a', dark: '#85c49a' },
]

export type GlassProfile = 'full' | 'balanced' | 'performance'
export type Density = 'comfortable' | 'compact'
export type MotionProfile = 'full' | 'reduced'

interface UIState {
  theme: string
  accent: string
  glass: GlassProfile | 'auto'
  density: Density
  motion: MotionProfile | 'auto'
  haptics: boolean
  sound: boolean
  resolvedGlass: GlassProfile
  sidebarOpen: boolean
  onboarded: boolean
  paletteOpen: boolean
  setTheme: (theme: string) => void
  setAccent: (accent: string) => void
  setGlass: (glass: GlassProfile | 'auto') => void
  setDensity: (density: Density) => void
  setMotion: (motion: MotionProfile | 'auto') => void
  setHaptics: (value: boolean) => void
  setSound: (value: boolean) => void
  setResolvedGlass: (value: GlassProfile) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setOnboarded: (value: boolean) => void
  setPaletteOpen: (open: boolean) => void
}

/** Conservative automatic profile: capability signals, not device names. */
export function detectGlassProfile(): GlassProfile {
  if (typeof window === 'undefined') return 'balanced'
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'performance'
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  if (cores <= 2 || memory <= 2) return 'performance'
  if (cores <= 4 || memory <= 4) return 'balanced'
  return 'full'
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: 'paper',
      accent: 'vermilion',
      glass: 'auto',
      density: 'comfortable',
      motion: 'auto',
      haptics: true,
      sound: true,
      resolvedGlass: 'balanced',
      sidebarOpen: false,
      onboarded: false,
      paletteOpen: false,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setGlass: (glass) => set({ glass }),
      setDensity: (density) => set({ density }),
      setMotion: (motion) => set({ motion }),
      setHaptics: (haptics) => set({ haptics }),
      setSound: (sound) => set({ sound }),
      setResolvedGlass: (resolvedGlass) => set({ resolvedGlass }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    { name: 'meridian:ui' },
  ),
)

export function resolvedTheme(theme: string): 'paper' | 'ink' {
  const valid = THEMES.some((t) => t.id === theme) ? theme : 'paper'
  if (valid === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'ink' : 'paper'
  }
  return valid as 'paper' | 'ink'
}

export function applyAppearance(state: UIState): void {
  const mode = resolvedTheme(state.theme)
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.setAttribute('data-accent', state.accent)
  document.documentElement.setAttribute('data-density', state.density)

  const glass = state.glass === 'auto' ? detectGlassProfile() : state.glass
  document.documentElement.setAttribute('data-glass', glass)

  const motion =
    state.motion === 'auto'
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'reduced'
        : 'full'
      : state.motion
  document.documentElement.setAttribute('data-motion', motion)

  const accent = ACCENTS.find((a) => a.id === state.accent) ?? ACCENTS[0]
  document.documentElement.style.setProperty('--accent', mode === 'ink' ? accent.dark : accent.light)

  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', mode === 'ink' ? '#121211' : '#f5f2ea')
}

export function applyTheme(id: string): void {
  applyAppearance(useUI.getState())
  void id
}
