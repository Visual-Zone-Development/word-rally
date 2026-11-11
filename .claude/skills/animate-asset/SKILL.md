---
name: animate-asset
description: Make motion in the game in this repo look natural, readable and consistent — character and creature cycles (walk, run, jump, attack, hit, death, idle), vehicles, projectiles, effects, pickups and UI — in any rendering style (2D sprites, procedural canvas, 3D) and fitted to the game's own physics and rules. Use for "the run looks robotic", "the jump feels floaty", "attacks have no weight", "everything bobs in sync", "add a death animation", or animation consistency across a game. Also load canvas2d-assets for 2D games or threejs-models for three.js code-built models.
---

# Animate an asset

Motion has two jobs: **feel good** (weight, snap, personality) and **tell the truth about the game**
(where things are, when an attack will land, how fast something moves). The second job comes from the
game's physics and rules, which differ in every game, so start there.

## 0. Read the game first

- `DESIGN.md`: the core verb, the physics (gravity, speeds, acceleration, friction, knockback), the camera,
  and the fairness rules (telegraph times, invulnerability windows, hitboxes). **Animation serves these.**
- `STYLE.md` → *Animation*: timing tokens (frame rates, cycle lengths, wind-up/recovery, squash amounts, eases).
  Match them; if this asset needs something new, add a rule for its whole class.
- How the game animates now: sprite frames, tweens, procedural poses, a skeletal rig. Extend that; don't add a
  second animation system. 2D: the **canvas2d-assets** skill (eased keyframes, springs, squash, sprite clips);
  three.js code-built models: the **threejs-models** skill (its rig).

## 1. Fit the motion to the physics

| Game motion | The animation must… |
|---|---|
| Ground movement | advance the stride at the speed the body actually moves (cycles/s ≈ speed ÷ 2 × step length): no foot sliding |
| Jumps and falls | follow the real arc: anticipation crouch, stretch going up, hang near the apex, stretch falling, squash on landing scaled by fall speed |
| Acceleration / turning | lean into acceleration, skid or lean on turns; vehicles roll and pitch with their suspension |
| Attacks and hazards | make the wind-up at least as long as the telegraph the rules give the player; the active frames match the hitbox's live time |
| Knockback and hits | recoil in the direction of the force, scaled by it; flash for the invulnerability window |
| Projectiles | orient along velocity; trail or stretch with speed |
| Floating / flying / swimming | slower, overlapping drift instead of steps; bank into turns |
| Turn-based / puzzle | snappy tweens with clear ends (ease-out, small overshoot); never block input on decoration |

If animation and simulation disagree, change the animation (or ask), not the physics, unless the user wants the feel changed.

## 2. Principles (what "natural" means)

1. **Anticipation**: a small opposite move before a big one (crouch before a jump, wind-up before a swing).
2. **Timing**: fast actions, slower preparation and recovery. Strike ≈ 10–15 % of an attack, wind-up ≈ 35–45 %.
3. **Squash and stretch** (cartoon and 2D especially): keep volume; stretch along motion, squash on impact.
4. **Follow-through and overlap**: things attached to the body (hair, capes, tails, antennae, weapons) lag and
   settle; arms lag legs; the action overshoots and settles back.
5. **Easing**: almost nothing moves linearly; ease in/out, `out` for snappy actions, overshoot for playful ones.
6. **Arcs**: limbs and thrown things travel in arcs, not straight lines.
7. **Weight**: heavy things accelerate slowly, bob deeper, take longer to stop; light things are quick and bouncy.
8. **Secondary action**: breathing, blinking, idle fidgets, dust on landing, sparks on hits.
9. **Variation**: desync crowds (per-instance phase and speed ±5–10 %), vary idle fidgets.
10. **Readability at play size**: exaggerate poses; one clear key pose per action (the "contact" or "strike" frame).
11. **Blending**: actions ease into each other; never snap from one cycle to another mid-stride.

## 3. Workflow

1. **Name the problem precisely** with the user ("feet slide", "landing has no impact") or from captures.
2. **Capture before changing anything**: a strip of frames across one cycle, plus the motion in the game.
   With model-asset's `scripts/shot.mjs`, render the game's gallery/viewer page with `frames=<n>` (it lays out one
   cycle as a strip), or capture the game at a few `wait=` offsets. Watch it live in `npm run dev` too.
3. **Decide where the fix lives**: one asset's timing (its own data), a whole class (shared curves or timing tokens),
   or a new action (new frames/curve, documented in STYLE.md).
4. **Change one thing, re-capture the same strip, compare** frame by frame. Keep the before strip for the user.
5. **Check transitions** (idle → move → act → move) and **check fairness**: wind-ups still match telegraphs, hitboxes
   still match the visible strike.
6. **Performance**: animation runs every frame for every instance; no allocations in the per-frame path, cap particle
   effects, and prefer shared curves over per-instance work.
7. **Update STYLE.md** (timing table, rules) and the DESIGN.md changelog.

## 4. Recipes

| Problem | Fix |
|---|---|
| Robotic walk | hip sway and bob twice per step, shoulders counter-rotate hips, arms lag legs, knees fold on the forward swing |
| Feet slide / moonwalk | tie stride rate to actual velocity; stop the cycle (ease to idle) when velocity is ~0 |
| Floaty jump | stronger anticipation, squash on landing, shorter apex hang, dust puff; match gravity (don't fake the arc) |
| Attack feels weak | longer wind-up, faster strike with an `out` ease, a 2–4 frame hold on impact, screen shake/hit-stop (honour reduced shake) |
| Heavy thing feels light | slower acceleration, deeper bob, delayed settle, bigger impact effects |
| Everything moves in sync | per-instance phase/seed, ±5–10 % speed variation |
| Snapping between actions | blend weights or cross-fade frames over ~0.1 s; don't reset cycle phase on state change |
| Stiff cloth / hair | attach it to a lagging element (spring or delayed follow) that trails velocity |
| Deaths pop out | finish the motion (fall, impact, settle), then fade or sink before removing |
