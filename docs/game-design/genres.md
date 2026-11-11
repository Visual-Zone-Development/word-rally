# Genre loop templates

Starting points for games that suit a handheld played on the couch. Each one lists:
- the loop
- the fun it naturally delivers
- a controller mapping
- a v1 you can build in one sitting
- stretch features that add the most

A great small game is often a **familiar genre + one twist + a theme**: "a Breakout where the ball is a cat", "a racing game where you build the track while driving".

---

### Arcade score-attack
*Star Courier, Pac-Man, Geometry Wars.*
- **Loop:** move/shoot → dodge and collect → points and combo → difficulty rises → beat your best.
- **Fun:** Challenge, Sensation.
- **Controls:** stick moves, A main action, B/X secondary (bomb, dash).
- **v1:** one arena, 2–3 enemy or hazard types, a timer or lives, a combo multiplier, a saved best.
- **Stretch:** daily seed, unlockable ships or modifiers, a boss every N waves, online-free leaderboard of your own top 10.

### Platformer
*Celeste, Super Meat Boy, Mario.*
- **Loop:** run/jump → traverse hazards → reach the flag or collectibles → new mechanic introduced.
- **Fun:** Challenge, Sensation, Discovery (secrets).
- **Controls:** stick/d-pad moves, A jump (hold for higher), X dash/attack, B back in menus.
- **v1:** a tight jump (coyote time ~100ms, jump buffer ~100ms, variable height, fast fall), 8–12 short single-screen levels built from a tile string map, instant respawn, a death counter.
- **Stretch:** collectibles per level, a time-trial mode, a new mechanic every 3 levels (springs, moving platforms, wall jump).

### Top-down action / roguelite
*Vampire Survivors, Enter the Gungeon, Hades.*
- **Loop:** fight a wave → collect XP or loot → pick 1 of 3 upgrades → harder wave → die → unlock something → run again.
- **Fun:** Challenge, Expression (builds), Sensation.
- **Controls:** stick moves, right stick or auto aims, A attack/dash, LB/RB cycle abilities, upgrade choice with d-pad + A.
- **v1:** one character, 3 enemy types, 8–10 upgrades that stack in interesting ways, 10-minute runs, a meta currency spent on 3–5 permanent unlocks.
- **Stretch:** characters with different starting kits, synergies, elites and a boss, biomes.

### Puzzle
*Tetris, Baba Is You, Threes, Sokoban.*
- **Loop:** read the board → plan → act → see the consequence (aha!) → next puzzle or rising pressure.
- **Fun:** Challenge (mental), Discovery, Submission (for endless falling-block styles).
- **Controls:** d-pad moves the cursor or piece, A acts, B undoes (always offer undo in level-based puzzles), Y restarts the level.
- **v1:** one core rule, 15–20 hand-made levels that each teach one idea (introduce, develop, twist), undo, level select with completion saved.
- **Stretch:** a second rule that combines with the first, par or star ratings, an endless mode.

### Racing
*Mario Kart, Trackmania, F-Zero.*
- **Loop:** drive → take the racing line and use boosts → beat rivals or the clock → unlock tracks.
- **Fun:** Sensation (speed), Challenge, Fellowship (versus).
- **Controls:** stick steers, RT/A accelerate, LT/B brake, X drift or boost, LB/RB look back or use item.
- **v1:** a top-down 2D car with drift physics, 3 tracks, ghost of your best lap, a lap timer. In 3D, one low-poly track.
- **Stretch:** AI rivals with rubber-banding, items, 2-player shared-screen versus, track unlocks.

### Rhythm
*Rhythm Heaven, Crypt of the NecroDancer, Beat Saber.*
- **Loop:** hear the beat → input on time → rated feedback (Perfect/Good/Miss) → combo builds → song ends with a grade.
- **Fun:** Sensation, Challenge, Submission (flow).
- **Controls:** A/B/X/Y or d-pad directions as lanes. Keep it to at most 4 inputs on a handheld.
- **v1:** a generated WebAudio track with a known BPM, hit timing from `AudioContext.currentTime` (never frame time), an input latency calibration screen, 2–3 songs.
- **Stretch:** difficulty charts per song, a visual theme per song, mid-song tempo changes.

### Cozy sim / management
*Stardew Valley, Unpacking, Mini Metro.*
- **Loop:** tend (plant/sort/build) → wait or progress time → harvest or reward → expand → new things to tend.
- **Fun:** Submission, Expression, Discovery.
- **Controls:** stick or d-pad moves the cursor or character, A interacts, B cancels, X/Y tool or menu, LB/RB cycle tools.
- **v1:** one small space, 3–5 things to tend with visible growth, a day or session cycle, autosave, one expansion unlock.
- **Stretch:** decorations, seasons, a collection book, gentle goals.

### Party / local multiplayer
*Overcooked, TowerFall, Gang Beasts, WarioWare.*
- **Loop:** short round (30s–3min) → chaotic interaction → winner or score → quick results → next round or minigame.
- **Fun:** Fellowship, Sensation, Challenge.
- **Controls:** one stick + A (+ B) per player, read per controller from `input.pads[i]` (`pads[i].x`, `pads[i].pressed('a')`); player 1 may also use the keyboard. Menus and pause use the merged `input` as usual. Keep it simple enough that a guest learns it in 10 seconds.
- **v1:** 2–4 players on one screen, a join screen (each slot says `${input.label('a')} to join` and fills when that pad presses it), one arena mode, round wins to 3, `players: "2-4"` and the `"local multiplayer"` tag. A disconnected pad pauses the game (`input.onPause`) and its slot shows "reconnect".
- **Stretch:** several modes or arenas, handicaps, solo practice vs. simple bots.

### Motion party (phone as the controller)
*Wii Sports, WarioWare: Smooth Moves, motion bowling and batting games.*
- **Loop:** a cue on the TV (a pitch, a beat, a corner, the pins) → a physical motion with the phone → an instant verdict with juice → next try or next player.
- **Fun:** Sensation, Fellowship (everyone watches the swing), Challenge (timing, the hook).
- **Controls:** `--party --controller motion`: tilt (tray, lean), a steering wheel, swings, flicks, shakes, grip-and-release, plus one big phone button. Gravity-based inputs and timed events work; **pointing at the screen doesn't** (see [motion.md](motion.md)). Every station also plays with stick, keyboard, mouse and touch.
- **v1:** 3–6 short stations or one sport with turns; calibration in each countdown; a phone status chip and strength meter; best scores per player. Tune with fake sensors, then real phones on the https build.
- **Stretch:** per-player timing calibration, a Sensor Bench, tournaments across stations.

---

## Scoping rule of thumb
- **v1 = one sitting.** The core loop, the full definition of done ([complete-game.md](complete-game.md)) and enough content for about 10 minutes of fun.
- **Stretch goes in DESIGN.md**, and `improve-game` picks it up later.
- If a v1 needs more than about 3 distinct systems (e.g. movement + combat + inventory + crafting + dialogue), cut until it doesn't.
