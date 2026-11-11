---
id: window-sizes
name: Window sizes
summary: A PC window resized to sizes the game wasn't laid out for: small, 16:9, ultra-wide and dense.
browser: --viewport 960x600
inputs: keyboard, mouse
optional: false
---

## How to play
Go through the title, pause and settings screens and a few seconds of
gameplay at each size, restarting the browser with each `--viewport`:
`960x600` (smaller than 1280×800), `1920x1080`, `2560x1080`, and `1280x800 --dpr 2`.
Use `press`, `key` and `mouse`.

## What must be true
- The game stays centred and scaled by `fitCanvas`, with letterbox bars in the game's background colour or black, never white or transparent.
- Nothing is clipped or cut off at any size, and the HUD keeps its 32 px margin inside the game area.
- At DPR 2, text and vector shapes are crisp. Pre-rendered glows or sprites may look soft, but nothing should be blurry overall.
- Mouse clicks and the on-screen pause button still hit what's drawn under the cursor at every size.
