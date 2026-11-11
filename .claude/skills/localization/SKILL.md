---
name: localization
description: Translate the game in this repo into other languages — move every player-facing string into a strings table, add a Language setting that defaults to the system language, handle longer text, plurals, number formats and fonts for other scripts, and keep input prompts from input.label(). Use for "add Spanish / French / Japanese", "translate the game", "make it multilingual", or preparing a game for players in other languages.
---

# Localization

Follow AGENTS.md (*Settings*, *Input hints*, *Screens and scaling*). Never edit the runtime files: the starter's menus, settings and prompts come from them, and you only translate the strings your game passes in.

## 1. Collect every string
1. Move every player-facing string in `game.js` (title, menus, HUD, tutorials, game over, story, item names, the Settings `extra` labels) into a `strings.js` module: `export const STRINGS = { en: { start: 'Start', score: 'Score', … }, es: { … } }`.
2. A tiny helper `t(key, vars)` looks up the current language, falls back to English, and fills `{name}`-style placeholders. Never build sentences by joining fragments; give translators whole sentences with placeholders.
3. **Prompts stay dynamic:** button names always come from `input.label()` / `drawPrompts`, so a translated line is `t('toStart', { button: input.label('a') })` → "{button} para empezar".
4. Plurals: separate keys (`lives_one`, `lives_other`) or `Intl.PluralRules`; numbers and dates through `Intl.NumberFormat` / `toLocaleString`.

## 2. Language setting
- Add a `choice` item to the Settings `extra` ("Language": English, Español, …, each named in its own language), saved by `settings.js`.
- Default to the system language (`navigator.language`) when the player hasn't chosen one, falling back to English.
- Changing it updates the screen immediately (rebuild menu labels from `t()`).

## 3. Layout and fonts
- Translations are often **30–50% longer** than English: give text room, wrap long lines, and check at the largest `textScale`; no line may overflow its box.
- **Fonts:** the bundled art fonts cover Latin text. For Cyrillic, Greek, CJK, Arabic and others, bundle a font file that covers that script in `assets/fonts/` (OFL fonts such as Noto, credited in `assets/CREDITS.md`, subset to the characters used to keep it small), or let it fall back to the system's sans-serif. Never load fonts from the internet.
- Right-to-left languages (Arabic, Hebrew) need right-aligned text and mirrored layouts; only take them on if the user wants them.
- Cover art keeps the game's title as it is (the art is shared by all languages).

## 4. Translate and verify
1. Translate with care for tone (the game's voice from DESIGN.md), and flag to the user that a native speaker should review.
2. Play every screen in each language at 1280×800 and at the largest text size; take screenshots with a repro script and read them.
3. `npm run check`, fix every ✗.
4. Bump `version` (minor), add the languages to DESIGN.md and the Changelog, mention them in the manifest `description` if it helps, commit (`<Name>: <languages>`) and push.
