---
name: camera
description: Build and tune the camera for the game in this repo, 2D or 3D — smooth follow with dead zones and look-ahead, room or screen locks, framing several players or a boss, zoom, bounds, shake that respects reduced shake, and in three.js third-person, top-down, isometric or fixed cameras that avoid walls and keep the action readable on a handheld. Use for "the camera is jerky / makes me sick", "I can't see what's coming", "the camera goes through walls", "zoom out for co-op", "frame the boss", or a new game's camera.
---

# Camera

Follow AGENTS.md (*Screens and scaling*). Read the game's `DESIGN.md` (kickoff answer for **camera / view**). The logical screen is always 1280×800; the camera decides which part of the world maps onto it. For three.js also read [3d.md](../../../docs/game-design/3d.md).

## 1. Decide what the player must see
- What's the most important thing to see **ahead**: the next platform, incoming enemies, the track?
- How much of the world fits at once (world units per screen) so things stay readable on a 7–8" display: characters at least ~48 px tall, threats visible ~1 s before they arrive.
- A **single fixed screen** is the easiest to read on a handheld. Only scroll if the design needs it.

## 2. 2D camera recipe
Keep a camera object `{ x, y, zoom }`; draw the world with `ctx.translate(640 - cam.x * zoom, 400 - cam.y * zoom)` and `ctx.scale(zoom, zoom)` inside `save()`/`restore()`, and draw the HUD afterwards in screen space.
- **Dead zone:** the camera only moves when the target leaves a box around screen centre (e.g. 160×120 px). Stops small movements from jiggling the view.
- **Look-ahead:** offset the target by velocity (platformers: 120–220 px in the facing direction; vertical look-ahead only when falling).
- **Smoothing:** frame-rate-independent lerp, `cam.x += (target - cam.x) * (1 - Math.exp(-k * dt))` with k ≈ 5–10. Never smooth so much that the player leaves the screen.
- **Platformers:** move vertically only when the player lands on a new height (platform snapping), not on every jump.
- **Bounds:** clamp to the level edges so the view never shows outside the world.
- **Rooms:** lock the camera to a room and slide (250–400 ms ease) when the player crosses into the next.
- **Several targets** (local co-op, a boss): frame the bounding box of all targets with padding; zoom out up to a limit, then push players back or teleport the straggler.
- **Pixel art:** round the final camera offset to whole pixels at the game's internal resolution to avoid shimmering.

## 3. 3D camera recipe (three.js)
- **Third-person chase:** a target point slightly above the character; the camera sits behind at a fixed distance and height, follows with damping, and turns with the right stick (`input.aimX` / `aimY`) with sensible limits on pitch. Recentre behind the player after ~1.5 s with no stick input.
- **Wall avoidance:** raycast from the target to the desired camera position; if it hits, move the camera in front of the hit point. Fade or hide objects between camera and player instead if raycasts are too costly.
- **Top-down / isometric:** fixed angle, follow with damping, optional slight look-ahead; usually the most readable choice on a handheld.
- **Field of view:** 50–65° for third-person; a small FOV kick (+3–5°) on boosts reads as speed.
- **Motion comfort:** avoid camera roll, constant bobbing and fast automatic spins; keep the horizon level.

## 4. Shake and effects
- Apply shake as an offset **after** following, from a decaying trauma value (see `game-feel`), and **skip it when `settings.data.reducedShake` is on**.
- Zoom punches on big moments (+5–10% for 200 ms) are fine; keep them out of reduced shake too if they're sharp.

## 5. Verify
1. Play the hardest moving part of the game: can you always see what's coming? Never lose the player off screen?
2. Check at 1280×800 and a 16:9 window (fitCanvas letterboxes, the camera itself doesn't change).
3. Pause freezes the camera; Restart snaps it to the start (no slide from the old position).
4. All camera numbers in `TUNING.camera`. `npm run check`, view the screenshot, fix every ✗.
5. Bump `version`, add a Changelog line, commit (`<Name>: camera`) and push.
