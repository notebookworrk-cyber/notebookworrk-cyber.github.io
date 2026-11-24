import { useSyncExternalStore, useState } from 'react'
import { Icon } from '../../app/icons'
import { audio, PRESETS } from './engine'

export function useAudio() {
  return useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot)
}

export function AudioPanel({ compact = false }: { compact?: boolean }) {
  const snap = useAudio()
  const [expanded, setExpanded] = useState(!compact)
  const preset = PRESETS.find((p) => p.id === snap.preset) ?? PRESETS[0]

  return (
    <div className={`audio-panel${expanded ? ' is-expanded' : ''}`}>
      <div className="audio-head">
        <button className="audio-play" onClick={() => audio.toggle()} aria-label={snap.playing ? 'Pause ambience' : 'Play ambience'}>
          <Icon name={snap.playing ? 'pause' : 'play'} size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="data-sm" style={{ color: 'var(--text)' }}>{preset.label}</div>
          <div className="label">{snap.playing ? 'playing · on this device' : preset.note}</div>
        </div>
        <button className="btn btn-quiet btn-icon" onClick={() => setExpanded((v) => !v)} aria-label="Expand audio controls">
          <Icon name="chevron" size={15} className={expanded ? '-rotate-90' : 'rotate-90'} />
        </button>
      </div>

      {expanded && (
        <div className="audio-body">
          <div className="audio-presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={`audio-preset${snap.preset === p.id ? ' is-active' : ''}`} onClick={() => audio.setPreset(p.id)} aria-pressed={snap.preset === p.id}>
                <span className="text-[13px]">{p.label}</span>
                <span className="label">{p.note}</span>
              </button>
            ))}
          </div>
          <div className="audio-controls">
            <label className="label">Volume</label>
            <input type="range" min={0} max={100} value={Math.round(snap.volume * 100)} onChange={(e) => audio.setVolume(Number(e.target.value) / 100)} aria-label="Volume" />
            <button className="btn btn-sm" onClick={() => audio.setMuted(!snap.muted)}>{snap.muted ? 'Unmute' : 'Mute'}</button>
          </div>
          <div className="audio-controls">
            <label className="label">Sleep timer</label>
            <select
              className="select w-auto min-w-[120px] py-2"
              value={snap.sleepMinutes ? String(snap.sleepMinutes) : ''}
              onChange={(e) => audio.setSleep(e.target.value ? Number(e.target.value) : null)}
              aria-label="Sleep timer"
            >
              <option value="">Off</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </select>
            <span className="data-sm dim">Sound is generated here. No account, no streaming.</span>
          </div>
        </div>
      )}
    </div>
  )
}
