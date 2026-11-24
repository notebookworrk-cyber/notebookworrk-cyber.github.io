import { create } from 'zustand'

/**
 * A one-second pulse, separate from the persisted timer store.
 * The timer store must not write to IndexedDB localStorage every second, so
 * display components subscribe here and recompute from Date.now() instead.
 */
interface ClockState {
  now: number
}

export const useClock = create<ClockState>(() => ({ now: Date.now() }))

export function advanceClock(): void {
  useClock.setState({ now: Date.now() })
}
