---
name: promote-game
description: Move a finished game out of this workshop (games/<id>) into its own public GitHub repo, so it can be listed on PushPlay's Discover tab and get its own releases, while players keep their saves. Use when the user says a game is "ready", "done", wants to "promote", "publish", "release", "put it on Discover", "give it its own repo" or "move it out". For a Steam release use graduate-game instead.
---

# Promote a game

Promoting is for a **workshop**: a repo with many games in `games/<id>/`, so one agent session can make and prototype any number of them. (A repo with one game at its root already has its own repo; there's nothing to promote.) A finished game moves into **its own repo** (one game per repo), which is what PushPlay's Discover tab and Studio expect. `npm run promote <id>` (`tools/promote/promote.mjs`) does the work; this skill covers the decisions and the three ways to run it.

What promoting does:
1. Checks the game (`npm run check <id>`).
2. Builds the new repo from the **one-game template** (its build kit, `AGENTS.md`, skills and docs), with the game's files at the root and `"movedFrom": "<this repo>"` in `pushplay.json`.
3. Creates the repo (public by default), pushes it, and adds the `pushplay-game` topic. The first push builds and publishes the game.
4. Removes `games/<id>` from the workshop and commits that.

Players don't lose anything: the launcher sees `movedFrom` and moves its tile to the new repo, keeping saves, play time and favorites. If the player follows the account (Add game → Follow a GitHub account), the new repo is picked up on its own.

## 1. Confirm
- The user has played it and calls it ready. Read `games/<id>/DESIGN.md` and mention unticked Definition of done items in one line; they don't block promoting.
- Ask once (one `AskUserQuestion`) only for what isn't known: the **repo name** (default: the game id, under the same owner as this repo) and **public or private** (public by default; only public repos can be listed on Discover).

## 2. Run it (pick what this environment can do)

**A. On a computer with `gh` signed in** (Claude Code locally):
```sh
npm run promote <id>                        # creates owner/<id>, public
npm run promote <id> -- --repo owner/name   # another name; --private, --keep (leave a copy here)
git push                                    # pushes the removal from the workshop
```

**B. From a phone or a cloud agent without `gh`: the "Promote a game" workflow.** It runs the same tool in GitHub Actions. Tell the user exactly:
> Open this repo on GitHub → **Actions** → **Promote a game** → **Run workflow**, type `<id>`, tap **Run**.

If you have a GitHub tool that can start a workflow (workflow_dispatch), run `promote.yml` with `game: <id>` yourself instead. It needs the `PROMOTE_TOKEN` secret once (see the top of `.github/workflows/promote.yml`); if a run fails with "Add a PROMOTE_TOKEN secret", walk the user through creating it.

**C. A cloud agent with a GitHub connector that can create repos** (no workflow token yet): build the folder, then create and push with the connector:
```sh
npm run promote <id> -- --no-create --out ../<name>
```
Create the empty repo with the connector (for example `create_repository`, public, no auto-init), give this session push access to it if your environment needs that (for example `add_repo` with push access), then `git -C ../<name> remote add origin https://github.com/<owner>/<name>.git && git -C ../<name> push -u origin main`. Then `git rm -r -q games/<id> && git commit -m "<Name>: moved to <owner>/<name>"` and push. Never push the game to any repo other than the one just created.

## 3. Verify
- The new repo's **Build games** run goes green and its `pushplay-latest` release has `<id>-web.zip` (the first push builds everything).
- This workshop no longer has `games/<id>`, and that commit is pushed.

## 4. Hand back
Tell the user:
- the new repo URL, and that **future work on the game happens there**: open a new agent session on that repo
- in PushPlay, following the account picks it up (or Add game → Add one repo); their saves carry over
- to list it on Discover, connect the repo in Studio
- new ideas still start here, in the workshop: "make a game where…"
