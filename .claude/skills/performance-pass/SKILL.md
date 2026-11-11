---
name: performance-pass
description: Measure and fix frame rate, stutter, load time and memory for the game in this repo so it holds a steady 60 fps on a Steam Deck and Legion Go at DPR 2 — frame-time profiling, object pooling, removing per-frame allocations, canvas 2D draw costs (shadowBlur, text, gradients, cached sprites), three.js budgets (draw calls, triangles, textures, instancing), and bundle size. Use for "it lags", "fps drops when lots happens", "slow on the Deck", "loads slowly", or a performance check before shipping. For crashes and other bugs use debug-game.
---

# Performance pass

Follow AGENTS.md (*Performance*) and [debugging.md](../../../docs/game-design/debugging.md). For three.js games read the budgets in [3d.md](../../../docs/game-design/3d.md). Measure first, fix the biggest cost, measure again.

## 1. Measure the worst case
1. Find the heaviest moment: the most enemies, particles and effects (late waves, a boss, an explosion chain). Use `window.__game.jumpTo(...)` or raise spawn counts in `TUNING` to reach it.
2. Add frame timing to the `?debug` overlay: frame time (ms) averaged over 1 s, the worst frame, and counts of entities, particles and (three.js) `renderer.info.render.calls` and `.triangles`.
3. Measure headlessly with a repro script at **1280×800 DPR 1** and **1280×800 DPR 2** (the Legion Go case). Record the worst 1 s average and the worst single frame. The headless browser is slower than real hardware, so treat numbers as relative: compare before and after.
4. For a breakdown, take a Chrome DevTools performance profile (Playwright's `page.context().tracing` or CDP `Profiler`) during the worst moment and find the top functions.

Targets: a steady 16.7 ms frame; no single frame over ~33 ms during play; no growth in memory over 5 minutes.

## 2. Common costs and fixes
| Cost | Fix |
|---|---|
| Allocating in the frame loop (new objects, arrays, closures, `map`/`filter` on big lists, string building) | pool entities and particles, reuse arrays, build HUD strings only when the value changes |
| Unbounded arrays | hard caps (particles ≤ 300 alive), remove dead entities by swap-and-pop |
| Collision checks O(n²) | a uniform grid or spatial hash |
| `shadowBlur`, filters, large gradients each frame | pre-render glows and gradients to an offscreen canvas **at 2×** once and `drawImage` them |
| Lots of `fillText` | cache static text to a 2× canvas; fewer font changes |
| Many small paths | batch same-colour shapes into one `beginPath` / `fill` |
| Full-screen redraw of a static background | draw the background once to an offscreen canvas |
| Fill cost at DPR 2 | fewer full-screen layers and alpha overlays; `fitCanvas` already caps DPR at 2 |
| three.js: many meshes | `InstancedMesh`, merged geometries, shared materials; < ~150 draw calls |
| three.js: heavy pixels | `renderer.setPixelRatio(Math.min(devicePixelRatio, 1))`, fewer real-time shadows, smaller shadow maps, no post-processing stack |
| three.js: textures | ≤ 1024² for most, power-of-two, compressed or small canvases |
| Slow first load | smaller assets (music ≤ ~3 MB), lazy-load music after the title is drawn, draw the first frame immediately |
| GC stutter | fewer allocations (see first row); avoid creating Audio nodes in bulk per frame (rate-limit SFX) |

## 3. Verify and record
1. Re-measure the same worst case at DPR 1 and DPR 2; report before → after numbers.
2. Play 5 minutes: no stutter creeping in, memory steady.
3. Gameplay must not change: the same seed gives the same run.
4. `npm run check`, fix every ✗.
5. Bump `version` (patch), add a Changelog line with the numbers, commit (`<Name>: performance`) and push. Tell the user what to notice on the device ("the boss explosion should no longer hitch").
