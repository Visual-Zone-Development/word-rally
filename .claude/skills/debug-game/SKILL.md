---
name: debug-game
description: Find and fix a bug in the game in this repo. Use for crashes, a failing `npm run check` (including its mouse-only and phone passes), blank or black screens, controls not responding, broken saves, stutter or low FPS, or anything that "doesn't work". For new features or tuning use improve-game; for a full frame-rate and load-time pass use performance-pass; for objects passing through walls or jittery physics use physics-feel; for online lag or desync use online-netcode; for "it's unplayable on my phone" (a layout problem, not a bug) use mobile-port, and for a touch scheme that feels wrong use touch-controls.
---

# Debug game

Follow AGENTS.md. Reference: [debugging.md](../../../docs/game-design/debugging.md), which has the common failures table, the debug overlay and test hooks, and the repro script.

1. **Reproduce first.**
   - Run `npm run check` and read every ✗ and ⚠. Crashes, console errors, 404s, network requests (including WebSockets), dialogs and blank screens are reported, and so are its input passes: gamepad, keyboard-only (Enter, then Esc must pause), mouse-only (menus by click, the pause button), touch (tap on the title menu), Start → `window.__game.state.screen === 'paused'`, a 16:9 render at DPR 2 (1280×720), and for a game with `phone` in its manifest the phone pass (touch only at 390×844 / 844×390, DPR 3: menus by tap, pause button, `visibilitychange` must pause, no text under 32 px in the phone space). Each failing pass names the input it used; reproduce with that input first. Phone-pass failures are usually a layout size (a 24 px HUD kept in the phone space), a target under the notch or home bar (`fit.safe`), `input.attach` given a different size than `fitCanvas`, or an `onPause` handler that only pauses from `playing`; debugging.md's table has the fixes. If the whole layout is wrong for a phone, that's `mobile-port`, not a bug fix. Static findings (F10 bound, save key without the game id prefix, missing `tags`; warnings for `menu.js` not imported or `input.attach` missing) are code fixes, not play bugs.
   - The play passes are short (a few seconds, A once, a stick nudge, then Start). If the bug happens later or needs specific inputs, copy the **repro script** from debugging.md into your scratch or temp directory, never the game folder. Set its input timeline to the user's steps, run it, read the console and **look at its screenshots**. Use `?debug`, `?seed=` and `window.__game` (`state.screen`, `TUNING`) to reach the state quickly. If the game lacks those hooks, add them; they're part of the definition of done anyway.
   - "Pauses by itself" or "won't unpause" is usually `input.onPause` (it fires on blur, hidden tab, launcher overlay, a phone's screen lock and when every pad disconnects) or `input.paused` not being cleared on Resume; "Esc quits my run" means `b` was treated as pause or `menu` as back. "The touch controls show with my controller" means the game draws its own instead of `touch.js` (which hides when `input.mode !== 'touch'`); "the stick fights the drag" means `input.pointer` is read for movement as well as the stick.
   - If you can't reproduce it, ask the user one focused question: what they pressed, what they saw, which input (controller, keyboard, mouse, touch), on the Deck / Legion Go, a phone or tablet, or in a browser, and at what window size or orientation.
2. **Narrow down.** Check the common failures table first. Then form one hypothesis at a time and confirm it with a trace (`console.error`, the overlay or `page.evaluate`) before changing code. Read the surrounding code; don't guess.
3. **Fix the root cause.** Keep it minimal and in the existing style. Don't rewrite systems or tune unrelated things while you're in there. Never patch a runtime file (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`, `touch.js`): if the bug is really in one, say so; the fix belongs in the kit. If the real fix is a redesign, say so and hand off to `improve-game`.
4. **Verify.**
   - Re-run the repro script (the bug is gone and nothing new crashes) and `npm run check`, and redo the AGENTS.md **Verification** pass for the input the bug was reported on.
   - Remove temporary traces. Keep the debug overlay, since it's off by default.
   - Where it's cheap, add a guard so this class of bug fails safely, e.g. try/catch around `JSON.parse` of saves, or clamping `dt`.
5. **Record it.**
   - Bump the patch `version` in `pushplay.json`.
   - Add a Changelog line to DESIGN.md, if the game has one (`Fixed: …`).
   - Commit (`<Name>: fix <bug>`) and push.
6. **Explain** to the user in two or three sentences: what was wrong, why, and what changed. Mention anything they should re-test on the Deck or Legion Go.
