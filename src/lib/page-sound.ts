'use client'

/**
 * The sound of a page turning.
 *
 * Synthesised rather than shipped as a file. A paper flip is a short burst of broadband
 * noise swept through a falling filter — a few lines of Web Audio — and an audio asset
 * for it would be a request, a payload and a cache entry for a third of a second of
 * sound that has to load before the very first turn to be any use at all.
 *
 * Two rules this respects, because sound on a website is easy to get wrong:
 *
 *   - The context is created on the first turn, never on page load. Browsers block audio
 *     before a gesture, and a page that reaches for the speakers while it is still
 *     rendering deserves to be blocked.
 *   - Every burst is slightly different. Identical samples repeated at speed sound
 *     mechanical, which is the opposite of the point.
 */

const STORAGE_KEY = 'northstar:page-sound'

export type PageSound = {
  play: () => void
  close: () => void
}

export function createPageSound(): PageSound {
  let context: AudioContext | null = null

  function ensureContext(): AudioContext | null {
    if (context) return context
    const Ctor =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null

    try {
      context = new Ctor()
    } catch {
      // Audio is unavailable or blocked. Turning pages must still work.
      return null
    }
    return context
  }

  return {
    play() {
      const ctx = ensureContext()
      if (!ctx) return

      // Safari suspends the context between gestures; nudging it is harmless when running.
      if (ctx.state === 'suspended') void ctx.resume()

      const now = ctx.currentTime
      const duration = 0.26

      // Noise burst — the rustle itself.
      const frames = Math.floor(ctx.sampleRate * duration)
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < frames; i += 1) {
        // Decaying white noise. The curve is steep: paper is a transient, not a wash.
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2.4
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      // A bandpass falling from bright to dull, which is what gives it "sheet of paper"
      // rather than "static". Start frequency wanders a little so repeats differ.
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.value = 0.9
      const start = 1500 + Math.random() * 500
      filter.frequency.setValueAtTime(start, now)
      filter.frequency.exponentialRampToValueAtTime(520, now + duration)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      source.start(now)
      source.stop(now + duration)
    },

    close() {
      void context?.close()
      context = null
    },
  }
}

/** Whether sound is on. Remembered per browser; on unless the reader has turned it off. */
export function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    // Storage can be blocked outright in private modes; that is not a reason to be silent.
    return true
  }
}

export function writeSoundPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Preference simply will not persist. Nothing else depends on it.
  }
}
