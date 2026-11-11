// pushplay runtime v10 — replaced by `npm run update-kit`; don't edit, extend from game.js.
//
// Sound through three buses (master, music, sfx) with volumes saved in the game's settings.
// Browsers keep audio silent until the player does something, so the context is unlocked on the
// first key, tap, click or controller press (the launcher allows autoplay, a plain browser doesn't).
// Everything mutes while the game is paused by the launcher or hidden, and comes back on resume.
//
//   const audio = createAudio({ settings })      // settings from createSettings(id)
//   audio.tone({ freq: 660, dur: 0.08 })         // quick synth blip on the sfx bus
//   audio.noise({ dur: 0.2, gain: 0.3 })         // hiss / explosion
//   const buf = await audio.load('./sfx/hit.ogg'); audio.play(buf, { rate: 1.1 })
//   audio.setVolume('music', 0.5)                // 0..1, saved; audio.volume('music') reads it

import { input } from './input.js'

const BUSES = ['master', 'music', 'sfx']

export function createAudio({ settings } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext
  const ctx = AC ? new AC() : null
  const buses = {}
  const volumes = { master: 1, music: 0.8, sfx: 1 }
  for (const bus of BUSES) {
    const stored = settings?.data?.[bus]
    if (typeof stored === 'number') volumes[bus] = Math.max(0, Math.min(1, stored))
  }
  if (ctx) {
    buses.master = ctx.createGain()
    buses.master.connect(ctx.destination)
    for (const bus of ['music', 'sfx']) {
      buses[bus] = ctx.createGain()
      buses[bus].connect(buses.master)
    }
    for (const bus of BUSES) buses[bus].gain.value = volumes[bus]
  }
  let muted = false

  const audio = {
    ctx,
    buses,
    get unlocked() {
      return ctx?.state === 'running'
    },
    /** Resume the context after a user gesture. Called for you on the first press; safe to call again. */
    unlock() {
      if (!ctx || ctx.state === 'running') return Promise.resolve()
      return ctx.resume().catch(() => {})
    },
    setVolume(bus, v) {
      if (!BUSES.includes(bus)) return
      volumes[bus] = Math.max(0, Math.min(1, Number(v) || 0))
      if (buses[bus] && !(muted && bus === 'master')) buses[bus].gain.value = volumes[bus]
      if (settings?.data) {
        settings.data[bus] = volumes[bus]
        settings.save?.()
      }
    },
    volume(bus) {
      return volumes[bus] ?? 0
    },
    /** Silence everything (paused, hidden); unmute() restores the master volume. */
    mute() {
      muted = true
      if (buses.master) buses.master.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
    },
    unmute() {
      muted = false
      if (buses.master) buses.master.gain.setTargetAtTime(volumes.master, ctx.currentTime, 0.02)
    },
    /** A synth note: freq in Hz, dur in seconds, type 'square' | 'sine' | 'triangle' | 'sawtooth', slide = Hz change over dur. */
    tone({ freq = 440, dur = 0.1, type = 'square', bus = 'sfx', gain = 0.2, slide = 0, delay = 0 } = {}) {
      if (!ctx) return
      const t = ctx.currentTime + delay
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, t)
      if (slide) osc.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur)
      env.gain.setValueAtTime(gain, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + dur)
      osc.connect(env).connect(buses[bus] ?? buses.sfx)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    },
    /** White noise burst for hits, explosions and whooshes. */
    noise({ dur = 0.2, bus = 'sfx', gain = 0.2, delay = 0 } = {}) {
      if (!ctx) return
      const t = ctx.currentTime + delay
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      const src = ctx.createBufferSource()
      const env = ctx.createGain()
      src.buffer = buffer
      env.gain.setValueAtTime(gain, t)
      env.gain.exponentialRampToValueAtTime(0.001, t + dur)
      src.connect(env).connect(buses[bus] ?? buses.sfx)
      src.start(t)
    },
    /** Play a decoded buffer (from load). Returns the source so music can be stopped: src.stop(). */
    play(buffer, { bus = 'sfx', rate = 1, gain = 1, loop = false } = {}) {
      if (!ctx || !buffer) return null
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate
      src.loop = loop
      if (gain !== 1) {
        const g = ctx.createGain()
        g.gain.value = gain
        src.connect(g).connect(buses[bus] ?? buses.sfx)
      } else src.connect(buses[bus] ?? buses.sfx)
      src.start()
      return src
    },
    /** Fetch and decode a sound file shipped with the game (relative URL). */
    async load(url) {
      if (!ctx) return null
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${url}: ${res.status}`)
      return ctx.decodeAudioData(await res.arrayBuffer())
    }
  }

  if (ctx) {
    const unlock = () => void audio.unlock()
    addEventListener('keydown', unlock)
    addEventListener('pointerdown', unlock)
    input.onAnyPress(unlock)
    input.onPause(() => audio.mute())
    input.onResume(() => {
      if (!document.hidden && !input.paused) audio.unmute()
    })
  }
  return audio
}
