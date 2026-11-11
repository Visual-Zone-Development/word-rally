# Motion controls: the phone as a motion controller

A party game can use each phone's motion sensors: tilt it like a tray, turn it like a steering
wheel, swing it like a bat, flick it, shake it, or grip it like a bowling ball. This guide is
what we learned building [Motion Lab](https://github.com/Visual-Zone-Development/motion-lab) and Toybox Bowling and playtesting them on real phones. The
`motion-controls` skill is the step-by-step version.

Scaffold with `npm run new-game <id> --party --controller motion`. That gives you:

| File | Side | What it does |
|---|---|---|
| `controller.html` | phone | `createPhoneMotion()` reads every sensor event; the page sends tilt, "up", gyro totals, strength, the big button, stillness, and swings with their exact time |
| `motion.js` | TV | `createMotion(party)`: per phone, calibrated `tilt`, a steering `wheel`, `swings` on the TV clock, `button`, `still`, clock sync and `center()` |

Both are yours to change (they aren't runtime files). The join page (part of the kit) asks for
permission and passes the sensors to the phone screen.

## What works and what doesn't

Phones know two things well: **which way gravity points** (from the accelerometer, fused with the
gyro by the OS) and **how fast they're turning** (the gyro). They don't know where they are in
the room, or where the TV is. Design around that.

| Works well | Why | Use it for |
|---|---|---|
| **Tilt** (gravity) | Absolute: never drifts, lag can't make it wander | marble mazes, balance, leaning, tray games |
| **Steering wheel** (gravity across the phone's face) | Absolute, and the most natural hold for a TV game | driving, flying, turning anything |
| **Swings, flicks, shakes** (gyro and acceleration peaks) | Short, strong signals; detected on the phone and timed there | bats, rackets, slashing, maracas, punching |
| **Grip and release** (hold a button, swing, let go) | The release moment is a button, which is exact; the swing gives speed and twist | bowling, throwing, casting a line |
| **Timing** (when a swing happens) | With clock sync, swing times are right to a few ms | rhythm, batting, any "hit it now" |

| Doesn't work | Why |
|---|---|
| **Pointing at the screen** (light-gun, Wii-style cursor) | A Wii remote's camera sees the sensor bar; a phone only knows how it turns. The heading drifts a few degrees a minute, so "where it points" is only relative to the last re-center. Gyro aiming like a mouse works for skilled players but casual players find it strange (two playtests agreed). We replaced Duck Shoot with a driving game. |
| **Position** ("move your arm up and the cursor goes up") | Position from the accelerometer must be integrated twice and drifts away within a second |
| **Precise continuous aiming over the network** | 50–150 ms from phone to TV; continuous control feels laggy where an event (a swing) doesn't |

## Reading the sensors (what the kit already does)

- **Permission and https.** iOS asks for motion permission only after a tap, and only on an
  https page. The join page shows "Allow motion controls" and answers the phone screen with a
  state: `on`, `ask` (waiting for that tap), `denied`, `unsupported`, or `insecure` (plain http).
  The published build is https. `npm run dev` over Wi-Fi is plain http, so phones fall back to
  their touch pad there: test motion on the published build.
- **Two sources.** iOS sends sensor events to the join page, which forwards every one to the phone
  screen (`{ type: 'motion', s: [...] }`, each with its age). Android sends them only to the focused
  frame, so the phone screen listens itself too, and uses whichever is fresh. If readings stop
  (Android after the frame loses focus), say so: "Motion paused: tap the screen".
- **Every event, with its own time.** 60–200 a second. Detect gestures on the phone from each
  event, not from one reading per network message (30 a second loses a swing's peak).
- **Axes.** `acceleration` (m/s², no gravity), `accelerationIncludingGravity`, `rotationRate`
  (deg/s about the phone's z, x, y as alpha, beta, gamma), orientation (alpha, beta, gamma in
  degrees). Turn x/y with `screen.orientation.angle` so a landscape phone doesn't rotate swipes.
- **Up, not Euler angles.** Raw gamma flips wildly when the phone stands upright. Compute the
  direction of "up" in the phone's frame (`upOf(beta, gamma)`) and measure tilt from that.
- **Directions in the room.** People hold the phone upright *and* flat like a remote. Read a flick
  as up/down along "up" (toward the ceiling) and left/right along the screen's right edge
  levelled, never along the phone's own y axis (which points forward when it's flat).
- **Gyro drift.** Learn the gyro's bias only when the phone truly rests (under 1.5 deg/s and
  almost no acceleration for 1.5 s), slowly, and cap it. Learning it from "slow" movement erases a
  steady aim.

## Calibration

- **Centre during the countdown.** Each round's countdown says how to hold the phone ("Hold it
  comfortably: that's level", "Hold it like a wheel, straight ahead") and calls `motion.center(id)`.
  Re-centering waits until the phone is held still (up to 1.5 s).
- **Don't reuse a saved pose for a different hold.** A "level" saved while pointing upright made
  the maze tilt-down need a huge tilt. Save timing offsets per player, not poses across stations.
- **Re-center button.** Always offer one on the phone and on the TV (`y`).
- **Learn timing bias.** Derby and Rhythm learn each player's steady lateness from their swings and
  keep it per player name. A steady 40 ms bias then stops costing hits.

## Latency and timing

- Phone → TV is 50–150 ms, with jitter. **Events are timed on the phone** (`pt`, its clock) and
  mapped to the TV clock with the fastest of the last 8 pings (`clockOff`): the fastest trip had
  the least queueing, so it shows the clocks best (like NTP). Judge timing against `swing.t`, not
  against when the message arrived.
- Wait a little before calling a miss: `t > target + window + rtt/2 + 0.08`.
- Continuous inputs (tilt, wheel) are smoothed with a One Euro filter: steady when slow, quick when
  fast. Lower `filterMin` = steadier but laggier (1.6 Hz felt right for a marble).

## Gesture recipes

| Gesture | Phone signal | Settings (`motion.configure`) | Notes |
|---|---|---|---|
| Flick (4 ways) | acceleration peak; direction from the push, in room axes | `{ thr: 12, cd: 320 }` | timed at the peak; a dead zone (2 m/s²) gives `dir: null` |
| Bat / racket swing | push-to-stop turn (fastest moment), or the gyro's peak for a wrist swing | `{ at: 'flip', cd: 600, gk: 1/30 }` | `gk` counts turning as strength: 30 deg/s = 1 m/s² |
| Shake (maracas) | any strong peak, direction ignored | `{ thr: 9, cd: 170, gk: 1/30 }` | big notes can ask for `power > 0.5` |
| Tilt (tray) | gravity | `tiltRange: 25` | add a steering assist if it drives something with momentum (below) |
| Steering wheel | gravity across the phone's face | `wheelRange: 70` | auto-accelerate and give one BRAKE button: a phone held as a wheel has no free thumbs for two |
| Grip, swing, release | gyro over the forward swing; the release is the button | (custom, see the skill's toolkit) | speed = peak swing rate, line = turn about "up", hook = wrist twist in the last 0.25 s about the direction of travel |

**Momentum needs an assist.** A marble driven by tilt as acceleration orbits whatever you aim it
at (late tilt + sideways speed that never decays). Bleed off speed across the tilt direction and
brake harder against it; a lagged-player simulation went from 5.5 s of circling to 2.5 s.

## Feedback on the phone

- A status chip: Motion on / Tap Allow / Motion paused / Needs https: touch pad.
- A strength meter with the threshold marked, and a flash plus `controller.vibrate()` on every
  detected gesture (iOS can't vibrate: the flash is what tells them).
- Show what was read: "← swing 72%", "Swing 450°/s · twist ↻".
- Big, thumb-sized buttons; one main button per station (FIRE, BRAKE, GRIP).

## Fallbacks (every station, every input)

Every motion station must also play with a controller, a keyboard, a mouse and touch:
stick = tilt or wheel, `a` = the phone's button and a swing, d-pad = directional flicks, mouse or
touch drag = swipe, a two-press power/hook meter for throws, a flick for bowling. Phones without
sensors get a touch pad (drag = tilt, quick drag = swing). Say on the HUD which source is active.

## Testing

- **Headless:** the skill's toolkit drives `controller.html` with a fake sensor stream (swings,
  turns, drift, landscape) in Playwright, and `motion.test.mjs` in the kit tests the TV side.
  Simulate players with a lag and a wobble to tune assists and medals.
- **Real phones**, on the published (https) build, an iPhone and an Android:
  the Bench shows sensor rate, clock sync, gyro drift and screen turn. Ask: does it go where I
  expect, does it ever drift, does a quick motion ever get missed?
