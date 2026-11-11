---
name: dialogue
description: Write and build conversations for the game in this repo — NPC dialogue with branching choices, conditions and remembered flags, character voices matched to the game's references, portraits and moods, voice blips, and a dialogue box that works with controller, keyboard, mouse and touch and matches the art style. Ships a readable script format and runner (dialogue-script.js), the box (dialogue.js) and a script linter (lint.mjs). Use for "add dialogue", "NPCs should talk", "add conversations / choices", "a dialogue system", "branching dialogue", "make the characters sound different", "the dialogue is flat / too long". For the story bible, premise and between-level story beats use story-and-dialogue; for translation use localization.
---

# Dialogue

Follow AGENTS.md (*Controls*, *Input hints*, *Screens and scaling*, *Saves*). The kit's **story-and-dialogue**
skill owns the story bible (premise, tone, cast, story beats) in DESIGN.md; read it first and stay inside it.
This skill is for conversations: what characters say to the player and to each other, the choices the
player makes, and the system that shows them.

The skill doesn't impose a writing voice. Each game's voice comes from its own references, the same way
its faces and art do. What stays fixed is the craft: structure, choices, length for a handheld screen, and a
system that works with every input.

## 1. Match the voice

Ask the user what the dialogue should sound like: games, films or books it should feel like, or a few sample
lines of their own. Then measure the reference instead of copying it:

| Measure | What to record |
|---|---|
| **Line length** | typical words per line; how often lines run to a second box |
| **Register** | plain, formal, archaic, slangy, technical; contractions or not; swearing or not |
| **Humour** | none, dry, absurd, punny; roughly how often (every line, every scene, rarely) |
| **Rhythm** | short exchanges or speeches; interruptions (`—`), trailing off (`…`), pauses |
| **Narration** | none (all spoken), stage directions (`: The forge hisses.`), or a narrator voice |
| **Choices** | full sentences the hero says, intent tags (`[Lie]`, `Ask about the sword`), or tone icons |
| **Address** | names, titles, nicknames; how NPCs talk to the player |
| **Density** | lines per conversation; how much is optional |

Write it into DESIGN.md under *Story* as **Dialogue voice**, with three example lines in that voice.
Every script follows it, and every review checks against it.

## 2. Character voice sheets

One short entry per speaking character, also in DESIGN.md:

```md
- **Brom** (blacksmith): wants to retire; hides that his hands shake. Short, grumpy sentences, no
  contractions when angry, calls everyone "lad". Never says please. Voice: low (130 Hz), square.
  Moods: neutral, grumpy, happy, sad. Sample: "Shop's closed." / "That old thing? Not for sale."
```

- A **want** (what they're after in the conversation) and a **secret or pressure** give every line a reason.
- **Speech habits** make characters distinguishable without names: sentence length, favourite words,
  words they never use, how they ask and refuse. Cover the speaker name and check you can tell who's talking.
- **Moods** list the portrait expressions the art needs (`Brom (grumpy): …` picks the grumpy portrait).
- **Voice** sets the blip pitch and timbre (`voiceBlip`), so each character sounds different even without audio files.

## 3. Writing a conversation

- **One purpose per conversation:** a quest, a clue, a relationship beat, a laugh. Write it down first.
- **Enter late, leave early.** No greetings and goodbyes unless they say something about the character.
- **Every line does a job:** it moves the purpose forward, shows character, or sets up a choice. Cut the rest.
  First drafts are usually 30 % too long.
- **Exposition through want and conflict:** the smith refuses to sell the sword, and *that's* how we learn it's
  special. Never "As you know…".
- **Subtext:** characters rarely say exactly what they feel. Let the mood, the portrait and what they avoid
  say it.
- **React and remember.** NPCs respond to what the player did (flags such as `~ set helpedMira`) with short
  callback lines. That's cheaper than branching and feels far more alive.
- **Handheld budget:** a line fits in the box (about 140 characters, 2–3 lines at 30 px); no more than about
  4 lines in a row without a choice; a conversation is under a minute unless the player keeps choosing to
  ask. `lint.mjs` checks the first two.
- **Read every line aloud** in the character's voice. If it's awkward to say, rewrite it.

## 4. Choices

- **2–4 options** that are different **intents**, not the same answer in three tones (unless tone is the
  point of the game, per the voice).
- **Short:** under about 40 characters. Put the detail in the reply, not the option.
- **Curiosity is never punished:** "ask about" options are `[once]` in a hub and always return, and there's
  always a way out (`Leave`).
- **Consequences show soon:** a choice that matters gets a reaction line now and a callback later. A choice
  that doesn't matter should still get a distinct reply.
- **Gated options** (`[if gold >= 50]`) appear only when available; don't show options the player can't pick
  unless seeing them is the point.
- **No timed choices** unless the game has a setting to turn the timer off (accessibility).

## 5. Structure patterns

Keep branching manageable. Trees that split at every choice explode; these don't:

- **Hub and spoke:** a question hub of `[once]` topics plus `Leave`, returning to the hub after each answer.
  Most NPC conversations.
- **Branch and bottleneck:** choices split for a few lines, then rejoin. Story scenes.
- **Gates:** `if` blocks and `[if …]` options read flags the game or earlier conversations set.
- **State, not trees:** remember outcomes in variables and react to them later, instead of writing separate
  versions of everything after.

```
=== smith
if not metBrom:
    Brom (grumpy): Shop's closed.
    ~ set metBrom
else:
    Brom: You again.
>> smith_hub
=== smith_hub
-> Ask about the sword [once]
    Brom: That old thing? {w} Not for sale.
    ~ set askedSword
    >> smith_hub
-> Buy the sword [if askedSword and gold >= 50]
    ~ set gold -= 50
    ~ emit give sword
    Brom (happy): Finally, a customer.
-> Leave
    Brom: Shut the door behind you.
    >> end
```

## 6. The script format

Full reference at the top of `toolkit/dialogue-script.js`. In short:

| Write | Means |
|---|---|
| `=== name` | a node (a conversation or part of one) |
| `Who (mood): text` / `: text` | a line (the mood picks the portrait) / narration |
| `-> text [if cond] [once]` + indented block | a choice; consecutive `->` lines form one set |
| `if cond:` / `elif cond:` / `else:` | conditions with `and`, `or`, `not`, `==` `!=` `<` `>` `<=` `>=` |
| `~ set flag` / `~ set gold -= 10` | variables (kept in the game's save) |
| `~ emit give sword` | an event the game handles: `on.give('sword')` |
| `>> node` / `>> end` | jump / finish |
| `$name`, `{w}`, `{w=0.6}`, `*word*`, `{shake}…{/shake}`, `{c=#hex}…{/c}` | variable, pause, emphasis, shake, colour |
| `… #id` at the end of a line or choice | a stable id for translations |

## 7. Build it into the game

1. Copy `toolkit/dialogue-script.js` and `toolkit/dialogue.js` into the game (next to `game.js`, or `src/`).
   Put scripts in `dialogue/*.js` as `export default \`…\`` (they load offline everywhere).
2. **Runner:** `createRunner(script, { vars: save.data.dialogue, on: { give, heal, … }, strings })`, then
   `.start('smith')`. Keep `vars` in `save.data` and `save.save()` when a conversation ends, so choices persist.
3. **Box:** `createDialogueBox({ input, settings, drawPrompts, portrait, blip, avoid: [PAUSE_BUTTON], style })`.
   - While `talk.active`, update the box instead of gameplay. `state.screen` stays `'playing'`, and `menu`
     still pauses: don't call `talk.update` while paused.
   - **Style it like the game** with `style.panel(ctx, x, y, w, h, kind)`: a pixel-art panel (pixel-art skill's
     `pixelui.panel`), a parchment card (art-direction's `paperCard`), or whatever the game's UI uses. Also set
     `font`, colours and `nameColors`.
   - **Portraits** are a callback, so they come from the game's own art: baked portrait frames per mood
     (the pixel-art skill renders them from the same model as the sprite), sprites the user supplied, or
     none. `talking` is true while text types, for a mouth flap.
   - **Voices:** `voiceBlip(audio, { Brom: { freq: 130 }, Mira: { freq: 300, type: 'triangle' } })`.
4. **Controls** (built in): A, Space, Enter, click or tap anywhere finishes the line, then advances. B
   fast-forwards to the next choice. Select / View (Tab) opens the log. Choices take the d-pad or stick and A,
   or a tap on the option, with hover highlight for the mouse. An on-screen Skip button appears for mouse and
   touch. Prompts come from `drawPrompts`. Pass the game's pause button in `avoid` so tapping it doesn't
   advance the text.
5. **Settings:** `textScale` and `reducedShake` are honoured. Add a *Text speed* range (0.5–2, saved as
   `settings.data.textSpeed`) to the Settings `extra` items.
6. **Translation:** lines and choices have ids (`#id` or `node:line`). The localization skill fills `strings`.

## 8. Verify

1. `node .claude/skills/dialogue/lint.mjs dialogue/*.js --entry <nodes the game starts>` and fix every ✗.
2. Read every conversation on the 1280×800 screen, at the largest Text size too: nothing clipped, nothing over three lines.
3. Play each conversation with controller, keyboard only, mouse only and touch: advance, skip, choose, log.
4. Pause mid-line and mid-choice; Restart and Quit to title mid-conversation: nothing replays wrongly, and
   flags only change when they should.
5. Check the voice: cover the names and read a scene. Can you tell who's speaking, and does it match the
   *Dialogue voice* in DESIGN.md?
6. `npm run check`, bump `version`, add a Changelog line, commit (`<Name>: dialogue …`) and push.

`toolkit/demo.html` shows the box in its four states (typing, markup, choices, log) with a stand-in input.
