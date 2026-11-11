---
id: auto-pause
name: Auto-pause and the launcher
summary: The launcher overlay opens, the window loses focus, or the controller dies mid-run.
browser: --viewport 1280x800 --gamepad
inputs: gamepad
optional: false
---

## How to play
Start a run with the controller. Then trigger each event below during
gameplay, one at a time, checking the result before resuming with the
controller. These events come from the launcher or the system, not the player,
so firing them with `eval` is allowed here:

1. `eval "dispatchEvent(new Event('pushplay:pause'))"`: the launcher overlay opens.
2. `eval "dispatchEvent(new Event('blur'))"`: the window loses focus.
3. `pad disconnect`: the only controller turns off. Then `pad connect`.

## What must be true
- Each event lands on the pause screen (`window.__game.state.screen === 'paused'`), and gameplay is frozen: two screenshots 2 seconds apart match.
- The game never resumes by itself, not even after `pad connect` or a `pushplay:resume` event. The player presses Resume.
- Progress is saved on pause: the game's `<id>-save-v1` entry in `localStorage` reflects the run (read it with `eval`).
- After Resume, the run carries on exactly where it was.
