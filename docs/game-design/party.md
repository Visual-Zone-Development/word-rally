# Party games: the TV and phones

A party game runs on the handheld or PC that's plugged into the TV. Everyone else joins from
their phone: they scan the QR code on the lobby screen, or open the address shown there in any
browser and type the four-letter room code. Controllers plugged into the machine can join too,
so the same game plays with phones, pads, or a mix.

Scaffold one with `npm run new-game <id> --party`, adding `--controller custom` when phones need
a screen of their own (a quiz answer, a hand of cards, a drawing pad), or `--controller motion`
when the phone's motion sensors are the controller (tilt, a steering wheel, swings; see
[motion.md](motion.md)).

## How it works

```
TV (game.js)                                     each phone (controller.html)
  party.update() every frame
  reads party.inputs[id], party.pressed(id,'a') ←─ controller.input({ x, y, a, b })
  party.on('msg', ({ from, data }))             ←─ controller.send({ pick: 2 })
  writes party.public  ─────────────────────────→  controller.public   (every phone)
  writes party.view(id) ────────────────────────→  controller.mine     (that phone only)
  party.send(id, data) ─────────────────────────→  controller.on('msg')
  everything else stays on the TV
```

- **The TV runs the whole game.** Phones only show what they're sent and send back taps.
- **Phones see only what you send them.** `party.public` is for everyone (prompt, choices,
  whose turn, the timer). `party.view(id)` is for one player (their cards, their secret role,
  their answer). Anything else, like the full deck or other players' answers, never leaves the TV,
  so nobody can peek. **Never put a secret in `party.public`.**
- **Changes only.** About 20 times a second the TV sends each phone what changed in `public` and
  its view. Write them freely; keep them to what phones show.
- **Inputs look the same from every player.** A phone using the stock pad sends `{ x, y, a, b }`,
  and a local controller reads the same way, so `party.inputs[id].x` works for both.

## The phone screen

`controller.html` sits next to `index.html` (in `public/` for a Vite game). It's one file with
its styles and script inline. The TV sends it to each phone, where it runs sandboxed with no
network: no CDNs, no fetch, images as `data:` URLs. The kit adds `controller.js` to the top,
which defines a global `controller`:

| API | |
|---|---|
| `controller.me` | `{ id, name, color, room }` |
| `controller.players` | `[{ id, name, color, kind, connected }]` |
| `controller.public`, `controller.mine` | What the TV shares with everyone, and with this phone only |
| `controller.on('update', fn)` | After any of the above change: re-render here |
| `controller.on('msg', fn)` | One-off messages from `party.send` |
| `controller.input({...})` | Held controls; sent when they change (at most 30 a second) |
| `controller.send(data)` | A one-off message: a choice, a typed answer, a finished drawing |
| `controller.vibrate(ms)` | A buzz, where the phone supports it |

While the TV's lobby is open, a built-in screen shows who's in and gives the first player a
Start button. Set `controller.lobbyScreen = false` to draw your own.

Design for a phone held in one hand on a couch: big tap targets (at least 56 px), one decision
per screen, text people can read at arm's length, portrait for custom screens. Text fields are
fine here (unlike in the TV game). Show the player's colour (`controller.me.color`) so they can
find themselves on the TV.

## Recipes

**Prompt, answer, vote (Quiplash-style).** `party.view(id).prompt` gives each player their
prompt, and the phone sends `{ answer }` from a text field. On the TV, collect answers in a
TV-only object, then put the anonymous options in `party.public.choices` and take votes as
`{ vote: i }`. Reveal who wrote what on the TV only.

**Hidden hands (cards, roles).** Deal on the TV; write each hand into `party.view(id).hand`. The
table, discard pile and whose turn go in `party.public`. When a player plays a card the phone
sends `{ play: cardId }`; check it's really in their hand on the TV.

**Drawing.** The phone draws on a `<canvas>` and sends the strokes when done, as compact point
lists (`{ strokes: [[x, y, x, y, …], …] }`, numbers rounded, coordinates 0–1000). Messages over
about 12 KB are refused, so send a long drawing in a few parts. The TV redraws them.

**Phones as gamepads (brawlers, racers).** Use the stock pad (`--controller pad`) and read
`party.inputs[id]` like local controllers. Phone input takes 50–150 ms to reach the TV, which
is fine for party brawlers and bumper games and wrong for precise aiming. Keep the action on
the TV, where everyone's looking.

**Phones as motion controllers (tilt, steer, swing, bowl).** Use `--controller motion` and the
`motion-controls` skill. Gestures are detected and timed on the phone, and the TV syncs to the
phone's clock, so timing games (batting, rhythm) work despite the delay; pointing at the screen
doesn't (see [motion.md](motion.md)). [Motion Lab](https://github.com/Visual-Zone-Development/motion-lab) is the worked example.

**Turn-based with spectators.** Leave the party unlocked so late arrivals join as watchers, or
`party.lock()` once the game starts. Seats of players who drop (locked phone, Wi-Fi) are kept
for two minutes: show them dimmed (`connected: false`) and skip their turn rather than ending
the game.

## Screens and flow

`title` → `lobby` → `playing` ↔ `paused`, with `state.screen` and `window.__game` exposed as in
every game. The lobby (`party-lobby.js`) shows the address, room code, QR code and everyone
who's in; A on the TV, or Start on the first phone, begins once `minPlayers` are in. During play,
`drawJoinBadge(ctx, party, x, y)` keeps the code on screen for latecomers. Pausing freezes the
game (the TV runs it): set `party.public.paused = true` so phones can say so. "End party" in the
pause menu calls `party.close()`, which tells every phone the game ended.

## Testing

- `npm run dev`: the local relay listens on your Wi-Fi, so scan the lobby's QR code with a
  real phone. Open the join address in a few browser windows (one per player) to test alone.
- `npm run check`: headless phones join by code, send input, must each see exactly their
  own `party.view(id)`, and one reloads to check it gets its seat back.
