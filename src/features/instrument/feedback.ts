let ctx: AudioContext | null = null
let enabled = typeof localStorage !== 'undefined' && localStorage.getItem('meridian:instrument-sound') !== 'off'

export function soundOn(): boolean {
  return enabled
}

export function toggleSound(): boolean {
  enabled = !enabled
  try {
    localStorage.setItem('meridian:instrument-sound', enabled ? 'on' : 'off')
  } catch {
    /* storage unavailable */
  }
  return enabled
}

export function haptic(ms = 8): void {
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
