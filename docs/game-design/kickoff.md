# Kickoff interview

The questions to settle before building a **new** game. Ask them in plain language, a few at a time (with `AskUserQuestion` in Claude Code, otherwise in chat), tailor every option to the idea, and put your recommendation first. The answers go into the **Kickoff** table at the top of `DESIGN.md`.

Rules:
- **Every topic marked *required* gets an answer before any code is written**: from the request itself, from the user, or (only when the user said "surprise me" / "you decide") from you as a recorded assumption. Never silently default a required topic.
- Don't re-ask what the request already settles. Show it in the round-1 recap instead ("Got it: a 2D frog platformer. A few quick questions…") so the user can correct it.
- At most **4 questions per round** and **3 rounds**. Each question has 2–4 options; the user can always type their own answer.
- Plain words, not jargon: "how should it feel?", not "pick an MDA aesthetic". Map answers to the frameworks yourself.
- Use option `preview`s to show what a choice means: a palette and mood for an art style, the camera and controls for a view, the core loop for a concept.

## Round 1: the shape of the game (required)

| Topic | Ask | Typical options | Notes |
|---|---|---|---|
| **Concept / genre** | "What kind of game?" | 2–4 genre loops from [genres.md](genres.md) that fit the idea | For a vague request ("make a fun game"), pitch **3 concepts** instead, each *familiar genre + one twist + theme*, each aimed at a different feel |
| **2D or 3D** | "Flat 2D or 3D?" | 2D canvas (Recommended unless the idea needs depth) / 3D with three.js | 3D means `--vite` and the budgets in [3d.md](3d.md) |
| **Art style** | "What should it look like?" | presets from [art-directions.md](art-directions.md) that suit 2D or 3D: pixel art, flat bold vector, neon, hand-drawn, low-poly, toon-shaded… | Preview the palette and mood |
| **Players** | "Who's playing?" | Solo / local 2–4 on one screen / online 2–N, one device each / party on a TV with phones | See [multiplayer.md](multiplayer.md) and [party.md](party.md) for what plays well |
| **Where will it be played?** | "Where will you play it?" | Deck, Legion Go and PC (Recommended: the 1280×800 default; also plays on a tablet with touch or a controller) / on a phone, held upright (portrait, `--phone portrait`) / on a phone, held sideways (landscape, `--phone landscape`; also fits the Deck and a tablet) / on a TV with phones as controllers (that's the party answer above) | See [phone.md](phone.md). A phone game must still play with a controller and a keyboard; the answer sets the layout space, the text sizes and whether on-screen controls are needed. Preview: the shape of the screen and where the thumbs go |

## Round 2: how it plays (required, follow-ups from round 1)

| Topic | Ask | Typical options |
|---|---|---|
| **Feel** (multiSelect, up to 2) | "How should it feel?" | Tense, one-more-try / Crunchy and explosive / Calm and cozy / Clever aha moments / Exploring and secrets / Laughing with friends |
| **Camera / view** | 2D: "Which view?" 3D: "Where's the camera?" | 2D: side-on / top-down / isometric / single fixed screen. 3D: third-person chase / top-down / isometric / first-person / fixed arena |
| **Session and structure** | "How long is a play session, and how does it end?" | Quick 2–5 min runs with a high score / 10–15 min hand-made levels / roguelite runs with unlocks / long game with saves and a story |
| **Like which game?** | "Any game it should feel like?" | 2–3 references that fit; Other for their own |

Follow-ups that replace a round-2 slot when they apply:
- **Online:** how many players (`--players 2-4`), co-op or versus, quick match or friends only.
- **Party:** phones as plain gamepads, a custom phone screen, or motion controllers that you tilt, turn or swing (`--controller pad|custom|motion`, see [motion.md](motion.md)), player count.
- **Local multiplayer:** co-op or versus, shared camera or one screen arena.
- **Phone:** one thumb or two (that mostly decides portrait vs landscape), stick and buttons or tap / swipe (`touch-controls` skill), and whether it should also play on the Deck (it must: ask what the controller form of each touch verb is).

## Round 3: details (ask only what's still open, skip the round if nothing is)

| Topic | Ask | Typical options |
|---|---|---|
| **Audience and difficulty** | "Who's it for?" | Me, I like a challenge / casual, anyone can pick it up / kids or family / selectable difficulty |
| **Assets** | "Do you have art or sound?" | None, draw it in code (Recommended) / I have files (then ask for the folder) / find free CC0 assets / generate painted art with my image API key (offer only if `OPENAI_API_KEY`, `GEMINI_API_KEY` or `REPLICATE_API_TOKEN` is set; mention the cost, [generated-art.md](generated-art.md)) |
| **Sound and music** | "What should it sound like?" | Chiptune / synthwave / calm ambient / orchestral-ish / punchy arcade SFX, little music |
| **Theme and name** | "Any setting or name in mind?" | 2–3 themes or names that fit; Other for their own |
| **Progression** | "What keeps you coming back?" | Beat your best score / unlock characters or upgrades / new levels / daily challenge |
| **Inputs** | only if the idea leans on aiming or dragging | Controller and keyboard only / also playable by mouse and touch (Recommended; required for a phone game) |

## After the interview

1. Fill anything still open with sensible defaults and list them as **assumptions**.
2. Write the Kickoff table and the rest of `DESIGN.md` ([template](DESIGN.template.md)).
3. Show a compact summary (pitch, feel, loop, view, controls, look, players, v1 scope, assumptions) and ask **Build it / Change something**. That's the last question: after approval, build to the end.
