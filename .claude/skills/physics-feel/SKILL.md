---
name: physics-feel
description: Build and tune the physics of the game in this repo so it feels good and stays stable — fixed-timestep integration, collision detection and response (AABB, circles, tilemaps, swept tests to stop tunnelling), bounce, friction, gravity, knockback, vehicles and ragdoll-lite motion, and when to use a physics library in a --vite game. Use for "objects go through walls", "the physics is jittery / explodes", "the ball bounces weirdly", "driving feels like ice", "add knockback", or a physics-based game (pinball, golf, billiards, stacking, destruction).
---

# Physics feel

Follow AGENTS.md (*Tech*, *Performance*). Read the game's `DESIGN.md`. Game physics is about **feel and readability**, not realism: tune for what's fun and predictable. For the feel layer on top (hit-stop, shake, squash) use `game-feel`.

## 1. A stable base
- **Fixed timestep:** accumulate the clamped frame `dt` and step physics at a fixed 1/120 s (or 1/60) with a cap on steps per frame; render with interpolation if motion stutters. This makes results identical at 60, 90 and 120 Hz and on any device, and makes `?seed=` replays exact.
- **Integration:** semi-implicit Euler (update velocity, then position) is enough for most games.
- **Units:** pixels and seconds; every constant (gravity, drag, restitution, friction, max speed) in `TUNING.physics`.
- Pause stops the accumulator; Restart clears velocities and contacts.

## 2. Collisions
| Shapes | Method |
|---|---|
| Tile maps | move one axis at a time and resolve against tiles on that axis (the classic platformer method) |
| Boxes (AABB) | overlap test, push out along the smallest overlap axis |
| Circles | distance test, push out along the normal; great for balls, characters, bumpers |
| Fast objects (bullets, balls) | **swept tests** or sub-stepping so they can't tunnel through thin walls |
| Many objects | a uniform grid or spatial hash for the broad phase |

**Response:** reflect velocity along the normal with restitution (bounce, 0–1) and reduce the tangent part with friction. Add a small "slop" so resting objects don't jitter, and put bodies to sleep when they're still.

## 3. Tuning for feel
- **Gravity:** heavier than real; platformers often use more on the way down (see `game-feel` for jumps).
- **Bounce:** a consistent restitution per material; clamp tiny bounces to zero so things settle.
- **Friction and drag:** separate ground friction, air drag and a top speed; "ice" is low friction on purpose only.
- **Knockback:** an impulse away from the hit with a short loss of control (100–250 ms), scaled by damage.
- **Vehicles (top-down):** split velocity into forward and sideways parts; kill most of the sideways part for grip, less for drift; steering scales with speed.
- **Predictability:** for golf, pinball or billiards, show an aim guide for the first bounce; keep the same shot giving the same result.
- **Juice:** sound and particles on impacts scaled by impact speed, rate-limited.

## 4. A library or your own?
Hand-written physics is best for platformers, top-down games and arcade bouncing. For stacking, ragdolls, joints or many interacting bodies, use a library in a `--vite` game (`npm install <pkg>`, e.g. a small 2D engine such as planck.js or matter-js, or Rapier / cannon-es for 3D), keep its timestep fixed, and keep its debug draw behind `?debug`.

## 5. Verify
1. Stress test: the fastest object against the thinnest wall, the biggest pile, the longest run; nothing tunnels, explodes or jitters at rest.
2. Same seed and inputs → same result (repro script, [debugging.md](../../../docs/game-design/debugging.md)).
3. 60 fps at the heaviest moment, DPR 2 included (see `performance-pass`).
4. `npm run check`, fix every ✗. Bump `version`, add a Changelog line, commit (`<Name>: physics …`) and push.
