---
name: story-and-dialogue
description: Add story, characters and writing to the game in this repo — a one-line premise, short story beats between levels, character barks, dialogue boxes, item and enemy names, title and game-over lines, and an ending — written for a 7–8" handheld screen, skippable, and driven by a controller. Use for "add a story", "give it characters", "add dialogue / cutscenes", "the text is boring / too long", "name things", or the Narrative or Fantasy fun target of a game.
---

# Story and dialogue

Follow AGENTS.md (*Screens and scaling*, *Input hints*). Read the game's `DESIGN.md`: fun targets (Narrative, Fantasy), theme, tone and art style. Story serves the play; one line of setup, then let the player do it ([framework.md](../../../docs/game-design/framework.md)).

## 1. Write the story bible (short)
Add a *Story* section to DESIGN.md:
- **Premise:** one sentence: who you are, what you want, what's in the way. Shown on the title or first screen.
- **Tone:** one or two words (silly, earnest, eerie, cozy) with an example line.
- **Cast:** 1–4 characters, each with a name, one trait and a way of talking ("short, grumpy sentences").
- **Shape:** a beat per act: setup → escalation → crisis → climax → ending, matched to the game's levels or waves ([level-design](../level-design/SKILL.md) pacing table).
- **Vocabulary:** in-world names for the game's things ("parcels", not "points"; "the Hollow", not "level 3").

## 2. Writing rules for a handheld
- A line is readable in **3 seconds**: about 60 characters at most; 2 lines per box; ≥ 28 px × `textScale`.
- **Show, don't tell:** prefer a bark during play ("They're behind us!") to a cutscene.
- **Never block play for long:** a story beat between levels is 1–3 boxes. Everything is skippable.
- Every line has a speaker portrait, name or colour so the player knows who's talking.
- Write for the reference games' feel (kickoff answer) and the game's tone; read every line aloud once.
- No typed text input (no naming by keyboard): offer a list of names picked with the d-pad if naming matters.

## 3. Build it
- **Data, not code:** a `story.js` module with beats as arrays of `{ who, text, mood? }`, keyed by level or trigger.
- **Dialogue box:** bottom of the screen, ≥ 32 px from the edges, panel in the palette, text typed on quickly (30–60 chars/s) with a soft blip per few letters through `audio.tone` (see `game-audio`).
  - `a` (or tap/click) finishes the line instantly, then advances; prompt from `drawPrompts(ctx, input, [['a', 'Next']])`.
  - `b` (or a ≥ 56×56 px on-screen Skip button for mouse and touch) skips the whole beat; show it with a prompt.
  - `menu` still pauses; the beat resumes where it was.
- **Barks:** short lines above a character's head for 1.5–2.5 s, rate-limited so they don't spam.
- **Remember what was seen** in `save.data` so repeat runs skip beats automatically (with a "Replay story" item in a menu if the story matters).
- **Ending:** a real ending screen with a closing line, then the results and the credits (including `assets/CREDITS.md` names if any).

## 4. Verify
1. Read every beat on the 1280×800 screenshot: does it fit, at the largest `textScale` too?
2. Advance and skip with controller, keyboard, mouse and touch.
3. Pause mid-line, Restart mid-beat, Quit to title mid-beat: nothing breaks or replays wrongly.
4. `npm run check`, fix every ✗. Bump `version`, update DESIGN.md (Story, Changelog), commit (`<Name>: story`) and push.
