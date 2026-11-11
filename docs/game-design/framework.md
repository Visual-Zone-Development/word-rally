# Design framework

Two lenses for turning a vague idea into a game someone will want to keep playing on a handheld. Use them to write `DESIGN.md` (template: [`DESIGN.template.md`](DESIGN.template.md)) and to diagnose a game that isn't fun yet.

When talking to the player, use plain words (*"tense and twitchy"*, *"calm and cozy"*), not the jargon here. The jargon is for you.

## The 8 formal elements

From Tracy Fullerton's *Game Design Workshop*. Every game has all eight, whether you designed them or not. Decide each one on purpose.

| Element | Ask | On the handheld |
|---|---|---|
| **Players** | How many, and how do they relate: solo, co-op, versus, one vs. the game? | One Deck or Legion Go, one screen. Local multiplayer means extra controllers on a shared screen (`input.pads[i]`, join by press), so no hidden information. Online multiplayer means one device each, so hidden information works, but every action lands about 50–150 ms late ([multiplayer.md](multiplayer.md)). |
| **Objectives** | What is the player trying to do, right now and overall? | One goal on screen at a time. It must be readable at a glance on a 7–8" display. |
| **Procedures** | What actions can they take? What does each button do? | Map every action to stick + A/B/X/Y/LB/RB/LT/RT (keyboard, mouse and touch equivalents come with `input.js`). One action per button and no chorded inputs. `menu` (Start / Esc / P / on-screen button) is pause only; B is free for gameplay; F10 and Start+Select belong to the launcher. |
| **Rules** | What's allowed, what isn't, and what happens when? | Teach rules by letting the player bump into them, not with text. |
| **Resources** | What do they spend, collect or manage: health, time, ammo, coins, space? | Show the important ones in the HUD, at least 24px and away from the outer 32px. |
| **Conflict** | What stands in the way: enemies, the clock, the puzzle, other players? | Conflict should scale. Plan how it grows over 1, 5 and 15 minutes. |
| **Boundaries** | Where does the game happen? What's the play space? | 1280×800 fixed space, letterboxed by `fit.js` on other screens. Decide whether the camera scrolls or everything fits on one screen. One screen is easier to read on a handheld. |
| **Outcome** | How does it end: win, lose, score, ongoing? | Make the ending feel like a moment: score tally, "new best!", and retry with one press. |

## The 8 kinds of fun

From Marc LeBlanc's MDA framework (Mechanics, Dynamics, Aesthetics). Pick **one primary** and **up to two secondary** targets. Every target must map to at least one concrete mechanic or feedback in the design. A target with no mechanic behind it isn't a target.

### Sensation: game as sense-pleasure
*"That feels so good."* Crunchy hits, satisfying sounds, juicy motion.
- Hit-stop (freeze 40–80ms on impact), screen shake scaled to the event, particle bursts (capped).
- Layered WebAudio: pitch-shift repeated SFX slightly so they don't fatigue; rising pitch on combos.
- Squash and stretch on jumps and landings, easing on every UI move, rumble via `gamepad.vibrationActuator` where available.
- *Pitfall:* juice on everything turns into noise. Save the biggest effects for the biggest moments, and offer a reduced-shake option.

### Fantasy: game as make-believe
*"I'm a space courier / a tiny wizard / a frog with a jetpack."*
- A clear, specific role named on the title screen and implied by the verbs (couriers *deliver*, wizards *cast*).
- Theme-consistent names for everything: "parcels", not "points".
- The world reacts to the player: NPCs, environment and sounds acknowledge what they do.
- *Pitfall:* a theme pasted on top of mechanics that don't express it.

### Narrative: game as drama
*"What happens next?"*
- A situation, not a cutscene: one line of setup, then let play tell the story.
- Escalation: each stage or wave raises the stakes, so the run has a shape (calm → crisis → climax).
- Short text beats between levels: 1–2 lines, skippable with A, at least 24px.
- *Pitfall:* walls of text on a 7" screen. Keep any line readable in 3 seconds.

### Challenge: game as obstacle course
*"I can beat this."* Mastery, tension, getting better.
- A clear skill to improve (timing, aim, planning), with failure that teaches: show what killed you.
- Difficulty ramp with early wins. Something new every 30–60 seconds.
- Fast retry (one press, under 1 second), a best score or time, and a near-miss "so close!".
- *Pitfall:* difficulty spikes, or deaths that feel unfair. Readability is fairness: telegraph attacks, use clear silhouettes.

### Fellowship: game as social framework
*"Laughing with friends on the couch."*
- Local co-op or versus on one screen with 2–4 controllers. Drop in and drop out from the title screen.
- Shared goals with individual moments to shine. Comeback mechanics so nobody falls hopelessly behind.
- Rounds of 1–3 minutes, then a results screen that's fun to look at together.
- *Pitfall:* split screen on a 7" display. Prefer one shared camera.

### Discovery: game as uncharted territory
*"What's over there? What does this do?"*
- Secrets, hidden paths, items with surprising interactions, a world map that fills in.
- Systems that combine (fire + oil, magnet + metal) so players find things you didn't script.
- A field guide or collection screen that records what's been found (saved in `localStorage`).
- *Pitfall:* nothing to find after the first run. Add randomness or layered secrets.

### Expression: game as self-discovery
*"I made this. This is my style."*
- Builds, loadouts or upgrade paths that support different playstyles.
- Cosmetic choices (colors, hats, ship parts) chosen with the d-pad, never text entry.
- Creative modes: sandbox, level editor with controller-friendly tools, photo mode.
- *Pitfall:* choices that don't matter, or one build that is obviously best.

### Submission: game as pastime
*"I just zone out and play."* Relaxing, rhythmic, low stakes.
- No fail state (or a gentle one). Soft ambient audio, slow pleasant loops.
- Satisfying repetition: tidy, grow, sort, collect. Progress persists between sessions.
- Can be put down at any moment: autosave, and pause-safe at all times.
- *Pitfall:* boredom. Add slow growth or small surprises so the loop keeps evolving.

### Plain-language mapping

Use this when interviewing the player:

| They say | Primary | Often pairs with |
|---|---|---|
| "Tense, twitchy, one more try" | Challenge | Sensation |
| "Crunchy, explosive, satisfying" | Sensation | Challenge |
| "Calm, cozy, chill" | Submission | Expression, Discovery |
| "Clever, aha moments" | Challenge (mental) | Discovery |
| "Exploring, secrets" | Discovery | Fantasy |
| "Being someone cool" | Fantasy | Narrative |
| "A story" | Narrative | Fantasy |
| "Building my own thing" | Expression | Submission |
| "Playing with friends" | Fellowship | Challenge or Sensation |

## The core loop

Every game has loops at three timescales. Write each one as **verb → challenge → reward → growth**.

| Loop | Timescale | Example (Star Courier) |
|---|---|---|
| **Moment-to-moment** | seconds | steer → weave between rocks → grab a parcel (sparkle and chime) → score goes up |
| **Round** | 1–5 min | 60-second run → rocks multiply → final tally → new best? |
| **Meta** | across sessions | beat your best score (stretch: unlock ships, daily seed) |

Many small games stop at the round loop. A meta loop (unlocks, upgrades, collections, daily challenges) is what brings people back the next day.

### The 30-second fun test

Before adding goals, enemies or menus, the **core verb alone** should feel good. Spend 30 seconds just moving, jumping or shooting in an empty room. If that isn't enjoyable, fix the feel first: acceleration, friction, response time, sound, animation. No amount of content fixes a dull verb.
