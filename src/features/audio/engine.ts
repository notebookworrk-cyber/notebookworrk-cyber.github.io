export type PresetId = 'rain' | 'wind' | 'ocean' | 'fire' | 'white' | 'pink' | 'brown' | 'quiet'

export interface PresetDef {
  id: PresetId
  label: string
  note: string
}

export const PRESETS: PresetDef[] = [
  { id: 'rain', label: 'Rain', note: 'steady, soft' },
  { id: 'wind', label: 'Wind', note: 'slow and wide' },
  { id: 'ocean', label: 'Ocean', note: 'long waves' },
  { id: 'fire', label: 'Fireplace', note: 'low crackle' },
  { id: 'white', label: 'White noise', note: 'even hiss' },
  { id: 'pink', label: 'Pink noise', note: 'gentler hiss' },
  { id: 'brown', label: 'Brown noise', note: 'deep and warm' },
  { id: 'quiet', label: 'Quiet room', note: 'barely there' },
]

export interface AudioSnapshot {
  preset: PresetId
  playing: boolean
  volume: number
  muted: boolean
  sleepUntil: number | null
  sleepMinutes: number | null
}

interface Voice {
  sources: AudioScheduledSourceNode[]
  nodes: AudioNode[]
}

const KEY = 'meridian:audio'
const Ctor = (): typeof AudioContext | null =>
  typeof window === 'undefined'
    ? null
    : window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      null

function noiseBuffer(ctx: AudioContext, kind: 'white' | 'pink' | 'brown' | 'crackle', seconds = 6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  if (kind === 'crackle') {
    let last = 0
    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-((i % 2400) / 70))
      last = (Math.random() * 2 - 1) * decay * (Math.random() < 0.02 ? 1 : 0.12)
      data[i] = last * 0.5
    }
    return buffer
  }
  let brown = 0
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    if (kind === 'white') data[i] = white * 0.5
    else if (kind === 'brown') {
      brown = (brown + 0.02 * white) / 1.02
      data[i] = brown * 3.2
    } else {
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      b3 = 0.8665 * b3 + white * 0.3104856
      b4 = 0.55 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.016898
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    }
  }
  return buffer
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private voice: Voice | null = null
  private listeners = new Set<() => void>()
  private timers = new Map<string, number>()
  private sleepTimer: number | null = null
  private snap: AudioSnapshot
  private cached: AudioSnapshot

  constructor() {
    let stored: Partial<AudioSnapshot> = {}
    try {
      stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AudioSnapshot>
    } catch { /* ignore */ }
    this.snap = {
      preset: stored.preset ?? 'rain',
      playing: false,
      volume: typeof stored.volume === 'number' ? stored.volume : 0.45,
      muted: stored.muted ?? false,
      sleepUntil: null,
      sleepMinutes: null,
    }
    this.cached = { ...this.snap }
  }

  // useSyncExternalStore requires a stable object between changes.
  getSnapshot = (): AudioSnapshot => this.cached

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.cached = { ...this.snap }
    this.save()
    for (const fn of this.listeners) fn()
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.snap))
    } catch { /* ignore */ }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    const C = Ctor()
    if (!C) return null
    this.ctx = new C()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.snap.muted ? 0 : this.snap.volume
    this.master.connect(this.ctx.destination)
    return this.ctx
  }

  private stopVoice() {
    if (!this.voice) return
    for (const t of this.timers.values()) window.clearInterval(t)
    this.timers.clear()
    for (const s of this.voice.sources) {
      try { s.stop() } catch { /* already stopped */ }
      s.disconnect()
    }
    for (const n of this.voice.nodes) n.disconnect()
    this.voice = null
  }

  private buildVoice(id: PresetId): Voice | null {
    const ctx = this.ensure()
    if (!ctx || !this.master) return null
    const sources: AudioScheduledSourceNode[] = []
    const nodes: AudioNode[] = []
    const kind: 'white' | 'pink' | 'brown' | 'crackle' =
      id === 'rain' ? 'white'
        : id === 'wind' || id === 'ocean' ? 'pink'
          : id === 'fire' ? 'crackle'
            : id === 'quiet' ? 'brown' : id
    const buffer = noiseBuffer(ctx, kind, id === 'fire' ? 10 : 6)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    sources.push(source)

    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    nodes.push(filter, gain)

    if (id === 'rain') {
      filter.type = 'bandpass'
      filter.frequency.value = 2200
      filter.Q.value = 0.4
      gain.gain.value = 0.32
    } else if (id === 'wind') {
      filter.type = 'lowpass'
      filter.frequency.value = 420
      gain.gain.value = 0.5
    } else if (id === 'ocean') {
      filter.type = 'lowpass'
      filter.frequency.value = 520
      gain.gain.value = 0.42
    } else if (id === 'fire') {
      filter.type = 'lowpass'
      filter.frequency.value = 1400
      gain.gain.value = 0.55
    } else if (id === 'quiet') {
      filter.type = 'lowpass'
      filter.frequency.value = 220
      gain.gain.value = 0.12
    } else {
      filter.type = 'lowpass'
      filter.frequency.value = id === 'white' ? 9000 : id === 'pink' ? 5000 : 1200
      gain.gain.value = id === 'brown' ? 0.5 : 0.32
    }

    source.connect(filter).connect(gain).connect(this.master)

    // Slow modulation gives the beds movement without continuous React work.
    if (id === 'rain' || id === 'wind' || id === 'ocean') {
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = id === 'ocean' ? 0.08 : id === 'wind' ? 0.06 : 0.35
      lfoGain.gain.value = id === 'rain' ? 0.05 : 0.18
      lfo.connect(lfoGain).connect(gain.gain)
      sources.push(lfo)
      nodes.push(lfoGain)
    }
    if (id === 'wind' || id === 'ocean') {
      const sweep = ctx.createOscillator()
      const sweepGain = ctx.createGain()
      sweep.frequency.value = id === 'ocean' ? 0.05 : 0.03
      sweepGain.gain.value = 180
      sweep.connect(sweepGain).connect(filter.frequency)
      sources.push(sweep)
      nodes.push(sweepGain)
    }
    for (const s of sources) { try { s.start() } catch { /* ignore */ } }
    return { sources, nodes }
  }

  async play(): Promise<void> {
    const ctx = this.ensure()
    if (!ctx) return
    if (ctx.state === 'suspended') await ctx.resume()
    if (!this.voice || this.voice.sources.length === 0) this.voice = this.buildVoice(this.snap.preset)
    this.snap.playing = true
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Meridian Audio',
        artist: 'Focus Studio',
        album: 'Study ambience · generated on your device',
      })
      navigator.mediaSession.playbackState = 'playing'
      navigator.mediaSession.setActionHandler('play', () => { void this.play() })
      navigator.mediaSession.setActionHandler('pause', () => this.pause())
    }
    this.emit()
  }

  pause(): void {
    this.snap.playing = false
    this.stopVoice()
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
    this.emit()
  }

  toggle(): void {
    if (this.snap.playing) this.pause()
    else void this.play()
  }

  setPreset(preset: PresetId): void {
    const wasPlaying = this.snap.playing
    this.stopVoice()
    this.snap.preset = preset
    this.snap.playing = false
    if (wasPlaying) void this.play()
    else this.emit()
  }

  setVolume(volume: number): void {
    this.snap.volume = Math.max(0, Math.min(1, volume))
    if (this.master) this.master.gain.value = this.snap.muted ? 0 : this.snap.volume
    this.emit()
  }

  setMuted(muted: boolean): void {
    this.snap.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : this.snap.volume
    this.emit()
  }

  setSleep(minutes: number | null): void {
    if (this.sleepTimer != null) window.clearTimeout(this.sleepTimer)
    this.sleepTimer = null
    if (!minutes || minutes <= 0) {
      this.snap.sleepUntil = null
      this.snap.sleepMinutes = null
      this.emit()
      return
    }
    const ms = minutes * 60_000
    this.snap.sleepUntil = Date.now() + ms
    this.snap.sleepMinutes = minutes
    this.sleepTimer = window.setTimeout(() => {
      this.sleepTimer = null
      this.snap.sleepUntil = null
      this.snap.sleepMinutes = null
      this.pause()
    }, ms)
    this.emit()
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend()
  }

  resumeContext(): void {
    if (this.ctx?.state === 'suspended' && this.snap.playing) void this.ctx.resume()
  }
}

export const audio = new AudioEngine()
