---
name: motion-controls
description: Make a party game that uses each phone's motion sensors as the controller — tilt like a tray, turn like a steering wheel, swing like a bat or racket, flick, shake, or grip-swing-release like a bowling ball — or fix one that feels wrong. Covers picking gestures that phones can actually do (and the ones they can't, like pointing at the screen), the --controller motion phone screen and motion.js on the TV, calibration, clock sync and timing, assists, phone feedback, fallbacks for every input, and testing with fake sensors and real phones. Use for "motion controls", "use the phone's gyro / accelerometer", "swing your phone", "tilt to steer", "phone as a steering wheel / bat / bowling ball", "Wii-style", "the motion feels laggy / drifts / goes the wrong way", or improving Motion Lab. For a phone screen of buttons, votes or drawings use party-phone-screen.
---

# Motion controls

Follow AGENTS.md (*Party games*). Read **[motion.md](../../../docs/game-design/motion.md)** first (what phones can and can't do, and why) and [party.md](../../../docs/game-design/party.md) for the party API. The worked examples are [Motion Lab](https://github.com/Visual-Zone-Development/motion-lab) (six stations and a live Sensor Bench). Never edit the party runtime files; `controller.html` and `motion.js` are yours.

## 1. Pick gestures phones can do
Map every verb in the design to one row of motion.md's tables. Rules that came from real playtests:
- **Prefer gravity** (tilt, steering wheel, lean): absolute, drift-free, unbothered by lag.
- **Swings, flicks, shakes and grip-release** are events detected and timed on the phone: great for timing games.
- **No pointing at the screen, no arm position.** A phone doesn't know where the TV is, and position drifts away within a second. If the idea is a light gun, make it something else (we replaced Duck Shoot with a driving station). Gyro-mouse aiming is only for an explicit "skilled players" mode.
- **One main button per screen** (FIRE, BRAKE, GRIP). Someone holding a phone like a wheel or a ball has one free thumb.
- Directions are **in the room**: up is toward the ceiling, however the phone is held.

Write the motion pipeline into DESIGN.md: each verb, its signal, its settings, its fallback.

## 2. Scaffold or add it
- New game: `npm run new-game <id> --party --controller motion [--vite] --players 1-4`. That writes `controller.html` (the phone: `createPhoneMotion()` plus a status chip, strength meter, big button, re-center and touch pad) and `motion.js` (the TV: `createMotion(party)`).
- Existing party game: copy `.github/pushplay/templates/party-controllers/motion.html` and `templates/party-motion/motion.js`, or paste [toolkit/phone-motion.js](toolkit/phone-motion.js) into your own `controller.html` (it must stay one file).
- On the TV, every frame after `party.update()`: `motion.update(dt)`, then per player `const m = motion.of(id)` → `m.tilt`, `m.wheel`, `m.swings`, `m.button`/`m.pressed`, `m.still`. Set the phone's prompt and button with `party.public.prompt` / `.btn` (or `party.view(id)` for one phone), and swing detection with `motion.configure({ thr, cd, at, gk })`.
- Throws: paste [toolkit/grip-throw.js](toolkit/grip-throw.js) into the phone screen (GRIP held, `readThrow()` on release → `{ peak, yaw, twist }`) and map those to speed, line and hook on the TV, with numbers in `TUNING`.

## 3. Calibrate, time and assist
- **Centre during each round's countdown**: show how to hold the phone, call `motion.center(id)`, which waits for a still phone. Don't reuse a pose saved for a different hold.
- **Judge timing on `swing.t`** (TV clock, from the phone's clock and the fastest ping), never on arrival. Learn each player's steady timing bias and keep it per player name. Give late messages a moment before calling a miss.
- **Assist anything with momentum.** Tilt-as-acceleration orbits its target: bleed off sideways speed toward the tilt and brake harder against it.
- **Steering**: auto-accelerate, one BRAKE, about 70° of wheel turn for full lock, and steering that eases in a little.
- All of these numbers live in `TUNING`, and the phone's (thresholds, windows, gyro weight) reach it through `cfg`.

## 4. Feedback and fallbacks
- Phone: the status chip (Motion on / Tap Allow / Motion paused: tap the screen / Needs https: touch pad), the strength meter with the threshold, a flash and `controller.vibrate()` on every gesture, and what was read ("← swing 72%").
- TV: show which source is driving ("phone motion", "controller", "touch pad"), and draw the input (a tilt arrow, a steering wheel, a timing meter).
- Every station also plays with stick, keyboard, mouse and touch (motion.md, *Fallbacks*); the title says "Phones join with the QR code; controllers and keyboards work too".

## 5. Test
1. **Fake sensors**: `node .claude/skills/motion-controls/toolkit/fake-sensors.mjs controller.html`. Add a scenario per gesture (a push-pull for a flick, a pendulum for a throw, a held turn for a wheel, a held phone with drift) and check direction, power and timing to within a sample (~5 ms).
2. **Simulated players**: drive the TV side with a bot that reacts 150–250 ms late and wobbles, to tune assists, windows and medals (a casual bot should reach bronze, a good one gold).
3. `npm run check`: headless phones join, play and reconnect (they have no sensors, so the touch pad path runs). Every phone must always have its own `party.view(id)`, even one that joins mid-game.
4. **Real phones**, an iPhone and an Android, on the **published https build** (`npm run dev` over Wi-Fi is http: phones get the touch pad there). Ask the player: does it go where you expect? does it drift? is a quick motion ever missed? how far do you have to tilt or turn? Fix those before adding content.
5. Bump `version`, update DESIGN.md's motion pipeline and Changelog, and add what you learned to motion.md if it's new.
