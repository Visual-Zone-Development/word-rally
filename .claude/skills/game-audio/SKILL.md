---
name: game-audio
description: Create and mix the sound for the game in this repo — generated SFX with audio.tone() and audio.noise(), bundled sound files, a music loop or sequencer that fits the mood, layering, variation and mixing on the master / music / sfx buses so everything follows the Settings sliders. Use for "add sound", "the game is silent", "make the music better", "sounds are annoying / repetitive", "add a soundtrack", or the audio part of a new game.
---

# Game audio

Follow AGENTS.md (*Audio*) and read the game's `DESIGN.md` (*Audio*, fun targets, kickoff answer for sound and music). Everything goes through `createAudio({ settings })` from `audio.js`; never create your own `AudioContext` and never edit `audio.js`.

## 1. List every sound the game needs
Go through the game's actions and screens and write a table in DESIGN.md under *Audio*:

| Event | Character | Priority |
|---|---|---|
| menu move / choose / back | soft tick / bright blip / low blip | must |
| jump, shoot, hit, pickup, hurt, death | … | must |
| combo, level up, new best | rising, rewarding | must |
| ambience, music | the kickoff's mood | must |

Every action and every menu move has a sound ([complete-game.md](../../../docs/game-design/complete-game.md)).

## 2. Generated SFX recipes
Keep them in one `sfx` object in `game.js` so each is a single call. The API is `audio.tone({ freq, dur, type, gain, slide, delay, bus })` and `audio.noise({ dur, gain, delay, bus })`.

| Sound | Recipe |
|---|---|
| Menu tick | `tone({ freq: 880, dur: 0.03, type: 'square', gain: 0.08 })` |
| Confirm | two tones, 660 then 990, `delay: 0.05` |
| Jump | `tone({ freq: 300, slide: 400, dur: 0.12, type: 'square' })` |
| Laser / shot | `tone({ freq: 1200, slide: -900, dur: 0.1, type: 'sawtooth', gain: 0.1 })` |
| Hit | `noise({ dur: 0.06, gain: 0.25 })` + `tone({ freq: 120, dur: 0.08, type: 'triangle' })` |
| Explosion | `noise({ dur: 0.4, gain: 0.35 })` + `tone({ freq: 80, slide: -50, dur: 0.4, type: 'sine', gain: 0.3 })` |
| Pickup / coin | `tone({ freq: 990, dur: 0.06 })`, then `tone({ freq: 1320, dur: 0.1, delay: 0.06 })` |
| Hurt | `tone({ freq: 220, slide: -120, dur: 0.2, type: 'sawtooth' })` |
| Combo step n | the pickup sound with `freq × 2^(n/12)` (a semitone up per step, capped) |

Variation: randomise pitch ±5–10% on repeated sounds, limit how many of the same sound can start per 50 ms, and keep `gain` low (0.05–0.3): many sounds stack.

**Bundled files** (user's or CC0): put them in `assets/sfx/` and `assets/music/` (`.ogg` or `.mp3`, music ≤ ~3 MB), credit them in `assets/CREDITS.md` ([assets.md](../../../docs/game-design/assets.md)), `await audio.load()` once at startup and `audio.play(buf, { rate, gain, bus })`.

## 3. Music
- **Generated loop:** a tiny step sequencer in `game.js`: a tempo, a 16-step pattern per voice (bass, lead, drums from `noise`), scheduled a bar ahead with `tone({ …, delay, bus: 'music' })` on a timer that stops while paused. Pick a scale that fits the mood (minor pentatonic for tense, major pentatonic for cozy).
- **Layers:** add a voice as intensity rises (a drum layer at wave 5, a lead at the boss). Players notice it as "something new".
- **Bundled track:** `audio.play(buf, { bus: 'music', loop: true })`, keep the source and `stop()` it on Quit to title and Restart.
- Don't count on music on the title screen before the first input (browsers block audio until a gesture; `audio.js` unlocks on the first press).

## 4. Mix and verify
1. Music sits under SFX (music `gain` about half of SFX). Important sounds (hurt, low health) are the loudest and most distinct.
2. Pause silences everything (`audio.js` mutes on pause; your sequencer must also stop scheduling). Restart and Quit to title stop the run's loops.
3. Move each Settings slider (Master, Music, SFX) to 0 and back; each must work.
4. Play 2 minutes: is anything grating or too repetitive? Fix it.
5. `npm run check`, bump `version`, update DESIGN.md (*Audio*, Changelog), commit (`<Name>: audio`) and push.
