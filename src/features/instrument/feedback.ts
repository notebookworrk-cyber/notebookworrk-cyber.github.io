let ctx: AudioContext | null = null
let enabled = typeof localStorage !== 'undefined' && localStorage.getItem('meridian:instrument-sound') !== 'off'
let hapticsEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('meridian:instrument-haptics') !== 'off'

export function soundOn(): boolean {
  return enabled
}

export function setSoundEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem('meridian:instrument-sound', value ? 'on' : 'off')
  } catch {
    /* storage unavailable */
  }
}

export function toggleSound(): boolean {
  setSoundEnabled(!enabled)
  return enabled
}

export function hapticsOn(): boolean {
  return hapticsEnabled
}

export function setHapticsEnabled(value: boolean): void {
  hapticsEnabled = value
  try {
    localStorage.setItem('meridian:instrument-haptics', value ? 'on' : 'off')
  } catch {
    /* storage unavailable */
  }
}

export function haptic(ms = 8): void {
  if (!hapticsEnabled) return
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not supported */
  }
}

export function tick(): void {
  if (!enabled) return
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(1650, now)
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.022)
    gain.gain.setValueAtTime(0.03, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.032)
  } catch {
    /* audio unavailable */
  }
}
