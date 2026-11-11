---
name: game-feel
description: Make the game in this repo feel responsive and satisfying ("juice") — movement acceleration and friction, jump tuning, hit-stop, screen shake, particles, squash and stretch, easing, impact sounds and rumble — aimed at the game's fun targets and honouring reduced shake. Use for "it feels floaty / stiff / weak", "hits have no impact", "make it juicier", "polish the feel", or the polish milestone of new-game. For animation cycles use animate-asset (if present); for new mechanics or balance use improve-game.
---

# Game feel

Follow AGENTS.md. Read the game's `DESIGN.md` first: feel serves its fun targets ([framework.md](../../../docs/game-design/framework.md)). Calm and cozy wants soft easing and gentle sound, not shake.

## 1. Find the core verb and test it alone
Pick the one action the player does most (move, jump, shoot, place, swing). Run `npm run dev` (or a repro script from [debugging.md](../../../docs/game-design/debugging.md)) and do only that verb for 30 seconds in an empty space. Write down what's wrong in plain words: *slow to start*, *slides too long*, *jump floaty*, *shot feels like nothing happened*.

## 2. Responsiveness first (before any effects)
Every number below goes in `TUNING`.
- **Input to motion within one frame.** Read `input` after `input.update()` and apply it the same frame. No easing on the start of a move unless the design wants weight.
- **Movement:** acceleration and deceleration as separate values; ground vs. air control; a top speed; turnaround faster than starting from rest.
- **Jumps (platformers):** coyote time ~100 ms, jump buffer ~100 ms, variable height (cut upward velocity on release), heavier gravity on the way down (×1.5–2), a capped fall speed.
- **Aiming and shooting:** fire on press, not release; slight aim assist or snap for stick aiming; muzzle flash and recoil on the same frame as the shot.
- **Menus:** every move has a sound and a visible change within one frame.

## 3. Feedback layers, biggest on the biggest moments
Build a small helper set in `game.js` (not the runtime files) and use it everywhere:

| Layer | How | Typical values |
|---|---|---|
| Hit-stop | freeze gameplay `dt` (not the UI) for a few frames | 40–80 ms on a hit, 120–200 ms on a kill or boss hit |
| Screen shake | trauma value 0..1 that decays; offset = trauma² × max × noise | max 6–16 px; **skip when `settings.data.reducedShake`** |
| Flash | white or colour overlay on the hit thing, not the whole screen | 1–3 frames; **skip full-screen flashes when `reducedShake`** |
| Particles | pooled array with a hard cap (≤ 300 alive) | 6–20 per hit, 30–60 per explosion |
| Squash and stretch | scale x/y by ±10–30% on jump, land, hit; ease back | 80–150 ms |
| Easing | `easeOutBack` for UI pops, `easeOutCubic` for movement, never linear for UI | 120–250 ms |
| Sound | every action; pitch ±5–10% random per play; rising pitch on combos | via `audio.tone` / `audio.noise` / `audio.play({ rate })` |
| Rumble | `navigator.getGamepads()[i]?.vibrationActuator?.playEffect('dual-rumble', { duration, strongMagnitude, weakMagnitude })`, guarded | 60–200 ms; strong only on big events |
| Numbers and text | damage numbers, "+100", combo counter that pops | ≥ 24 px × `textScale` |

Rules:
- One impact = several layers at once (stop + shake + flash + particles + sound). That's what makes it feel heavy.
- Scale effects by importance: a pickup gets a sparkle and a chime; a boss kill gets everything.
- Hit-stop, shake and particles all freeze while paused and reset on Restart.
- Keep 60 fps at DPR 2: no `shadowBlur` in the frame loop, pre-render glow sprites at 2×, reuse particle objects.

## 4. Check and tune
1. Play the verb again for 30 seconds and compare with your notes from step 1. Tune one number at a time; live-tune through `window.__game.TUNING` in the dev console.
2. Turn **Reduced shake** on in Settings: the game must still read well, with no shake, no full-screen flashes and no strobing.
3. `npm run check`, view the screenshot, fix every ✗.
4. Bump `version` (patch), add a Changelog line to DESIGN.md (tick the *Feel* items in Definition of done), commit (`<Name>: game feel`) and push.
5. Tell the user what to notice: "the jump should now feel snappy; the dash freezes for a beat on a hit".
