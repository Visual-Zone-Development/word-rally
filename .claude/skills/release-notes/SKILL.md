---
name: release-notes
description: Prepare an update of the game in this repo for release — check the version bump, turn the DESIGN.md Changelog and the git history into player-facing "what's new" notes, optionally show them in-game once after an update, update the repo README's game list, and write the commit message and a short post the user can share. Use for "write release notes", "what changed since last time", "prepare a release", "announce the update", or at the end of new-game or improve-game when the user wants notes.
---

# Release notes

Follow AGENTS.md. Pushing the default branch publishes the build to PushPlay automatically; this skill makes sure the update is described well and the version is right. It never pushes to the default branch on its own.

## 1. Gather what changed
1. Read `pushplay.json` (`version`) and the Changelog in `DESIGN.md`.
2. Find the last released state: the last commit on the default branch (`git log -1 origin/<default>`), and the changes since then (`git log --oneline origin/<default>..HEAD` and `git diff --stat`). For a new game, everything is new.
3. Check the **version bump** matches the change: patch for fixes and tuning, minor for features or content, major for a reworked game or a save or netcode break. Online and party games: bump whenever the netcode changed (only the same version plays together). Fix the version and the Changelog if they're missing or wrong.

## 2. Write the notes
Write for **players**, not developers: what they'll notice, in plain words, most exciting first.

```
Star Courier 1.3.0
• New: a boss at wave 10 — the Comet Hauler.
• New: unlock three ships by delivering parcels.
• Better: dashing now freezes for a beat on a hit, so it feels punchier.
• Fixed: the game no longer stutters during big explosions.
```

- 3–6 bullets, each starting with **New / Better / Fixed**.
- No file names, function names or `TUNING` keys.
- Mention anything players must know (a save reset, a changed button, a new setting) first.

Put the notes in the DESIGN.md Changelog entry for this version (keep any developer detail as a second line).

## 3. Optional: "What's new" in the game
If the user wants it, show the notes once after an update:
- store `lastSeenVersion` in `save.data` (bump the save version with a `migrate` if the shape changes);
- on the title screen, if it differs from the current version, show a small panel with the bullets (≥ 24 px × `textScale`), closed with `a` or `b` (prompt via `drawPrompts`), then save the new version;
- never block starting the game: A on the title still starts after closing the panel.

## 4. Finish
1. If the game is new or renamed, update the list of games in the repo's `README.md` (only if the README already lists games).
2. `npm run check`, fix every ✗.
3. Commit with a message like `<Name> 1.3.0: boss, ship unlocks, punchier dash` and push to the working branch.
4. Give the user the notes ready to paste (e.g. for a group chat), and say that the update reaches PushPlay once it's on the default branch and the GitHub Action has finished.
