---
name: online-netcode
description: Make an online multiplayer game feel good despite network delay, using the kit's net.js (the host runs the game) — instant local feedback, smoothing, generous and fair hit rules, what belongs in net.state versus net.event, private views for secrets, bandwidth limits, joins and leaves mid-match, dropped and reconnecting players (net.status, "Reconnecting" on phones), and testing with two copies. Use for "online feels laggy", "hits don't register", "players teleport", "too much bandwidth", "add online play", "it loses the match when my phone locks", or any change to an --online game's networking.
---

# Online netcode

Follow AGENTS.md (*Online multiplayer*) and **read [multiplayer.md](../../../docs/game-design/multiplayer.md) first**: it has the full `net.js` API. Never edit `net.js` or `lobby.js`. The model is fixed: every copy calls `net.setInput(...)`; only the host runs the rules in `hostUpdate(dt)`, reading `net.inputs[id]` and writing `net.state`; every copy draws `net.view`.

## 1. Find what feels bad
Run `npm run dev` and play in **two browser windows** (the dev relay starts automatically); also play as the non-host, which is where lag shows. Note: is it **input delay** (my action shows late), **jitter** (others jump around), **unfair hits** (I got hit when I'd dodged), or **bandwidth** (the check warns above about 20 KB/s for two players)? `window.__kitNet` shows status, players and bytes sent.

## 2. Fixes by symptom
| Symptom | Fix |
|---|---|
| My own action feels late | **Instant local feedback**: play the sound, flash, muzzle effect or a small predicted motion on button press on the local copy, before the host confirms. Keep the authoritative result from `net.view` |
| My character feels sluggish | Lower-latency mechanics: shorter wind-ups are hidden by local animation; movement that accelerates (rather than snapping) hides delay |
| Others jump or stutter | Keep positions and angles **fractional** (they're blended between updates); keep counters whole; don't recompute wobbling floats |
| Teleporting on respawn / big moves | Send a `net.event('teleport', { id })` so copies snap instead of gliding across the map |
| Hits feel unfair | Generous hitboxes, slower projectiles, telegraphed attacks; judge hits on the host only; show hit results with a clear effect |
| Too much data | Only what players must see goes in `net.state`; particles, shake and sounds come from `net.event` on each copy; key collections by id (`bullets: { b17: {...} }`), never arrays that shift; no per-frame timers in state (send an end time once) |
| Secrets visible in dev tools | Hidden info goes in `net.privateView(id)` → `net.mine`, never in `net.state` |
| Someone leaves mid-match | Handle `net.on('leave')`: remove or freeze their character, keep the match going if the rules allow; `end` (host left) returns everyone to the lobby with the reason |
| A phone locks or the app is hidden | The socket is suspended; `net.js` reconnects to the same room and seat. Read `net.status` every frame: while `'reconnecting'` draw "Reconnecting…" over play and on the pause screen and send empty input; when `net.connection` is `'offline'` show "Connection lost" with a Back to lobby item. `input.onPause` already pauses the player's own controls on `visibilitychange`; the host keeps running, so they rejoin the present |
| The host's phone locks | The match stalls for everyone. Say in the lobby "Keep this screen on while hosting"; on the host's `'reconnecting'`, other copies freeze on `net.view` and show who they're waiting for; a host whose `net.connection` stays `'offline'` ends the match (`end`) |
| Late joiner sees nothing | Everything they need to draw must be in `net.state` (they get it all once on join); don't rely on events they missed |

## 3. Design for the delay
About 80 ms plus network delay sits between the host and other players. Good fits: co-op, party, racing, brawlers with chunky hits, sports, turn-based and card games. Avoid frame-perfect timing; when a mechanic needs precision, make it **host-friendly for everyone** (wider windows, slower bullets, aim assist).

## 4. Flow rules that must keep working
- `title` → `lobby` → `playing` ↔ `paused` with `state.screen` and `window.__game` exposed.
- `menu` opens the `menu.js` pause menu (Resume, Settings, Leave game); it only stops your own controls (`net.setInput({})`), the host keeps running.
- Show who's who: "You", colours by `net.slot(id)`.
- `net.status` (its usual values plus `'reconnecting'`) and `net.connection` (`'connected' | 'reconnecting' | 'offline'`) are drawn somewhere on every playable screen; the pause screen says "Reconnecting…" while reconnecting.

## 5. Verify
1. Two windows by hand, as host and as guest; then with one window throttled (DevTools → Network → slow 4G) to feel delay. Then take one copy offline for 20 s (DevTools → Network → Offline) and back: it must show "Reconnecting…", rejoin the same room and seat, and carry on; a phone game in device mode should do the same after `visibilitychange`.
2. `npm run check` plays two copies together through a local relay; fix every ✗ and the bandwidth warning.
3. **Bump `version`** whenever the netcode or state shape changes: only builds with the same version play together.
4. Update DESIGN.md (Changelog), commit (`<Name>: netcode …`) and push.
