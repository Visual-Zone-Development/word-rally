# Online multiplayer

Online games play through one shared relay that is already set up. The game maker configures
nothing: no server, no keys, no accounts. The kit gives every online game the same three files,
and the AI writes only the game.

```sh
npm run new-game <id> --online --players 2-4
```

| File | What it is | Edit it? |
|---|---|---|
| `net.js` | Connection, rooms, and the shared state that syncs itself | No. A runtime file like `input.js`, shared by every online game |
| `lobby.js` | The lobby: Quick match / Host / Join, open-games list, waiting room; works with A / `b` and up / down on every input | No. Style it with `createLobby` options |
| `game.js` | Starter: title → lobby → playing, with the host running the rules | Yes: this is the game |

The scaffold also sets `"online": true` and `"players"` in `pushplay.json`; add the `online multiplayer` tag. Everything else in AGENTS.md still applies: `fit.js` for scaling, `menu.js` for every menu, `settings.js`, `input.attach`, `window.__game = { state, TUNING }`, and the runtime files stay unedited.

## How it works: the host runs the game

One player's copy (the **host**, whoever opened the room) runs the real game. Everyone else
sends only their controls and draws what the host says is happening. This keeps every copy in
agreement without the relay knowing anything about the game.

```js
const net = createNet({ minPlayers: 2, maxPlayers: 4 })

// every frame, on every copy
net.setInput({ x: input.x, y: input.y, fire: input.held('a') })
if (net.isHost) hostUpdate(dt) // the rules: read net.inputs, write net.state
net.update()
draw(net.view) // what to draw: net.state, smoothed between updates

function hostUpdate(dt) {
  for (const id of net.players) {
    const ship = (net.state.ships ??= {})[id] ??= { x: 640, y: 400, hp: 3 }
    const i = net.inputs[id] ?? {}
    ship.x += (i.x ?? 0) * TUNING.speed * dt
  }
}
```

| API | |
|---|---|
| `net.isHost`, `net.me`, `net.players` | Who you are; player ids in join order, host first |
| `net.slot(id)` | 0 for the host, 1, 2…: use it for colours and spawn points |
| `net.state` | Host: write the game here. Players: the newest state received |
| `net.view` | Draw this on every copy (the host's is its own state) |
| `net.inputs[id]` | Host: each player's latest `setInput` value, including the host's own |
| `net.event(name, data)` | One-off moments everyone should see or hear (goal, explosion, round over) |
| `net.on(type, fn)` | `join`, `leave`, `start`, `end` (host left), `event`, `disconnect` |
| `net.leave()`, `net.disconnect()` | Back to the lobby, or hang up entirely |
| `net.privateView(id)` | Host: one player's private view (their hand, their role). Only that player gets it |
| `net.mine` | This player's private view, from the host |

## Only changes are sent

You never call "send" for state. About 30 times a second `net.js` compares `net.state` with
what players already have and sends only the fields that changed. Nothing changed means nothing
is sent. Numbers are rounded to 2 decimals first, so jitter doesn't count as a change. A player
who joins gets everything once, then the same changes as everyone else. To keep games cheap:

- **Put only what players must see in `net.state`.** Timers, AI internals and particles stay
  in local variables. Particles and screen shake come from `net.event` on each copy.
- **Whole numbers jump, fractions glide.** `net.view` blends fractional numbers (positions,
  angles) between updates, but takes whole numbers (scores, countdowns, lives) as they are. Keep
  counters whole (`Math.ceil(timeLeft)`), and positions fractional, as physics makes them.
- **Key things by id, not array position:** `bullets: { b17: {...} }`, not `bullets: [...]`.
  Removing the first item of an array shifts every index after it, and all of them get resent.
- **Don't write a value just to write it.** Setting `x = x` costs nothing; recomputing a
  float that wobbles at the 3rd decimal place does.

The check warns above about 20 KB/s for two players.

## Secrets

Everything in `net.state` reaches every copy, and anyone can read it in the browser's developer
tools. Hidden information (a hand of cards, a secret role, the answer) goes in a private view
instead: the host writes `net.privateView(id).hand = [...]`, and only that player's copy gets it,
as `net.mine.hand`. Same rules as `net.state`: changes only, keyed by id, numbers rounded.

Playing with everyone on one TV instead? See [party.md](party.md).

## Screens and flow

- **Title** (`${input.label('a')} to play online`, never a literal "Press A") → **lobby**
  (`lobby.update()` returns `'start'` when the host starts, `'back'` to return to the title) →
  **playing**. Keep these in `state.screen` as `title`, `lobby`, `playing`, `paused`.
- **`menu`** (Start / Esc / P / the on-screen pause button) opens the pause menu, built with
  `menu.js` like every other menu, but it can't pause the world: it only stops your controls
  (`net.setInput({})`) while the host keeps running. Items: Resume, Settings, Leave game.
  `'back'` (B / Backspace / `menu` again) resumes; Leave game calls `net.leave()` and returns
  to the lobby. `b` never leaves a match without that menu item.
- When the host leaves, `end` fires and the game goes back to the lobby, which says why.
- The lobby needs no text entry: rooms are joined from a list or by Quick match. Its prompts
  come from `input.label('a')` / `input.label('b')`, so they follow the player's device.
- Show who's who on screen ("You", colours by `net.slot`), since players can't see each other.

## Design for latency

Players see the world about 80 ms plus network delay behind the host: `net.view` is drawn a
moment in the past and blended between updates, so motion stays smooth even when the network
wobbles. Host events (`net.event`) play at that same moment, in step with the picture. Pick
mechanics that tolerate that:

- **Good fits:** co-op, party games, racing, arena brawlers, sports, turn-based and card games.
- **Hard:** frame-perfect fighting games, competitive twitch shooters. Prefer generous
  hitboxes and slower projectiles.
- Make the local player's own actions feel instant with a sound or flash on button press,
  even before the host confirms the result.

## Testing

- `npm run dev` starts a local relay as well: open the game in **two browser windows** to
  play against yourself.
- `npm run check` runs the usual check (including `menu` → `state.screen === 'paused'`),
  then plays **two copies** together through a local relay. It fails if they can't get into a
  match, or if the second copy never receives state. Keep the template's flow
  (title → lobby → playing) so the check can drive it. The relay is the one network connection
  the check allows.
- `window.__kitNet` in the console shows status, players and bytes sent.

## On the Deck

Builds get the relay's address and a pass for that repo, game and version automatically. Only
copies with the same version play together, so bump `version` when the netcode changes. If the
build log says online play is off, the relay isn't configured for this repo yet. The game still
builds, and its lobby shows the reason.
