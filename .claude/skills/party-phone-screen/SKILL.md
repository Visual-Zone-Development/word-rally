---
name: party-phone-screen
description: Design and build the phone side of a party game — controller.html, the one-file screen each phone runs (voting, answering, drawing, hidden hands, custom buttons) — plus what the TV shares with party.public and party.view(id). Big tap targets, one decision per screen, readable at arm's length, works with no network. Use for "design the phone screen", "phones need to vote / draw / see their cards", "the phone UI is confusing", "make a custom controller", or building a --party --controller custom game.
---

# Party phone screen

Follow AGENTS.md (*Party games*) and **read [party.md](../../../docs/game-design/party.md) first**: it has the full `party` (TV) and `controller` (phone) APIs and recipes. Never edit `party.js`, `party-lobby.js`, `qr.js`, `controller.js` or `net.js`; `controller.html` and `game.js` are yours.

## 1. Map every phase to one phone screen
For each phase of the game (lobby, prompt, answering, waiting, voting, reveal, results), write one row:

| Phase | TV shows | Phone shows | Phone sends | Data |
|---|---|---|---|---|
| answer | the prompt, who's done | text field + Send | `controller.send({ answer })` | `party.view(id).prompt` |
| vote | the anonymous answers | 2–4 big buttons | `controller.send({ vote: i })` | `party.public.choices` |
| waiting | — | "Waiting for others…" + your colour | — | `party.public.phase` |

Drive the phone with a single `party.public.phase` value and switch the whole screen on it. **Secrets** (hands, roles, own prompt) only ever go in `party.view(id)`; check every play on the TV (is that card really in their hand?).

## 2. Phone design rules
- **One hand, on a couch:** portrait, tap targets ≥ 56 px (bigger is better), main action at the bottom within thumb reach.
- **One decision per screen**, with a clear title saying what to do; nothing to scroll.
- Text readable at arm's length (≥ 18 px body, ≥ 28 px headings).
- **Show who you are:** a band or background in `controller.me.color` plus the name, so players find themselves on the TV.
- **Feedback on every tap:** pressed state, then a "Sent ✓" or waiting state; `controller.vibrate(20)` on important taps.
- **Text fields are fine on phones** (never on the TV game); limit length and trim.
- **Drawing:** a `<canvas>` with pointer events, send compact strokes when done (numbers rounded, coordinates 0–1000); messages over ~12 KB are refused, so split long drawings.
- **Reconnects:** the phone may reload (screen lock, Wi-Fi); always render from `controller.public` / `controller.mine` on `controller.on('update')`, never from local-only state.
- Show `party.public.paused` as a "Paused" overlay.

## 3. Technical rules for controller.html
- **One file**: HTML, CSS and JS inline; images as `data:` URLs; no CDNs, no fetch (it runs sandboxed with no network).
- Re-render on `controller.on('update', render)`; one-off messages from `party.send` on `controller.on('msg')`.
- Held controls (if any) via `controller.input({...})`; choices via `controller.send(data)`.
- The kit's lobby screen covers the phone until the game starts; set `controller.lobbyScreen = false` only if you draw your own.
- Keep it light: a small DOM, CSS for layout, no frameworks.

## 4. Verify
1. `npm run dev`: open the join address in 3–4 browser windows sized like phones (DevTools device mode) and play a full round; scan the QR code with a real phone if possible.
2. Reload one phone mid-round: it gets its seat and screen back.
3. Every phase has a phone screen; no phone ever shows another player's secret.
4. `npm run check` (headless phones join, play and reconnect), fix every ✗.
5. Bump `version`, update DESIGN.md (phase table, Changelog), commit (`<Name>: phone screen`) and push.
