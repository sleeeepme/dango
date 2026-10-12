# Codex handoff — ダンゴムシころころ

## Project
- iPhone Safari playable, child-friendly, no game-over underground woodlouse exploration game.
- GitHub repository: https://github.com/sleeeepme/dango
- Production: https://dangomushi-korokoro-game.vercel.app/
- Vercel project: dangomushi-korokoro-game (prj_Tnkfk8zJyNFpufaQSPZXButAHaca)
- GitHub main is connected to Vercel production auto-deployment. Push working updates to main; keep the public URL.

## Code
- index.html: full-screen canvas and one icon-only boost button. No visible text or numbers. No build step or external dependencies.
- game.js: readable single-file gameplay, world generation, physics, input and procedural Canvas artwork.
- Fixed world width: 2240. Floors are 330px apart, with 166–196px openings at different horizontal positions. Extend rows as the player descends.
- Camera follows horizontally and vertically; resize changes the viewport without regenerating the world or losing progress.
- Drag horizontally and hold to roll; quick upward flick on release jumps. Left/right touch buttons were removed. Full energy enables the icon-only special boost button. Arrow keys and Space are also supported.
- Woodlouse legs and antennae animate. Drawn leaves, mushrooms, crystals and roaming collectible caterpillars replace gameplay emoji artwork.
- Five depth palettes, soil layers, moss, roots, ferns and glowing mushrooms. Opening markers are in the world, so exploration is necessary to find them.

## User priorities and constraints
1. Explore a wide map sideways to find where to descend. Do not return to viewport-wide automatically descending platforms.
2. Mostly flat terrain, occasional low bumps, and no continuous automatic rolling on down-slopes.
3. Upward fast swipe should visibly launch the woodlouse; slow upward drag must not lift it. Ceiling collision should bounce.
4. Preserve intuitive touch controls, smooth frame rate, mobile Safari compatibility and existing gameplay features.
5. Deploy via GitHub main -> Vercel. Do not replace the whole Vercel HTML via direct deployment.
6. Test syntax, physics, complete browser flow and confirm deployment READY before claiming publication. Be explicit when real-device testing has not happened.
7. Communicate in Japanese.

## Physics and verification
- Fixed simulation step: 60Hz; render uses requestAnimationFrame. Clamp elapsed time to 100ms and reset timing/input on visibility changes.
- Circle radius 20; collision surfaces match drawn slab tops, sides and undersides.
- Persisted ground support snaps to the surface to prevent positional slope drift. Drag controls only horizontal motion; upward release applies jump.
- Static world bounds, camera transforms and touch coordinates remain independent of viewport width.
- Run `node --check game.js` and `node --test tests/physics-baseline.cjs`.
- The tests inject a VM-only hook before initialization ends; keep game state private in production.
- Initial evidence and the wide-map update are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).
- The wide-map update resolves the four initial issues (slow drag lift, slope drift, frame dependence and resize mismatch). These now have assertions, not merely diagnostics.
- Browser checks at phone and landscape viewport sizes do not constitute real-device iPhone Safari verification.

## Visual direction — children first
- Keep a welcoming picture-book underground world: mint and grass greens, warm clay, rounded foliage, colorful treasure and gentle lighting.
- The woodlouse has a blue shell, big readable eyes, rosy cheeks and a smile. Its shell rolls while the face remains readable.
- Do not introduce realistic horror, gloomy darkness, sharp threatening forms or visually aggressive effects while polishing graphics.
- Keep the collision outline and path clear; scenery must not hide openings. Use a large pastel icon-only boost button. The child cannot read: show no visible letters, labels, numbers, title, HUD or instructions. Movement is by dragging; do not restore left/right touch buttons.

## Jump, treasure and friendly wildlife (2026-10-12)
- Gravity is 0.55 px per fixed step squared. Normal flick launch is capped at 8–11 px/step; keyboard launch is 9.5; boost is 12.5.
- Normal jumping requires ground or a 7-step edge grace period. Consuming a jump clears the grace period; flicks cannot repeatedly lift the player in mid-air. Boost may launch in mid-air.
- Normal maximum rise is about 100px. Preserve grounded rest, slow-drag behavior and ceiling bounce.
- Collectible treasure is drawn at 1.75x with a ring/glow, positioned 43px above the floor, and collected within 44px. Caterpillars retain their existing behavior.
- A successful treasure pickup shows its picture above the player at 2x for 48 steps and then fades; no text or numbers.
- Friendly fauna are separate from loot: rhinoceros beetle, stag beetle, mantis, ladybug, frog, snail and butterfly. They move gently, greet nearby players and never attack, block or disappear as pickups.
- Place friends between treasures so larger icons do not hide faces or distinctive horns.

## Horizontal flick regression guard
- A quick sideways release launches with horizontal speed 10–14 and a low jump (vertical launch 7) when grounded. Preserve this alongside upward flicks and held drag movement.
- Airborne sideways flicks steer horizontally without resetting vertical velocity. Do not restore repeated upward mid-air jumps.
- Inactive air motion permits the release impulse up to 14; normal active drag/keyboard and grounded movement remain capped at 8.5. Landing friction stops the player.

## Stable terrain rendering
- Sample platform underside noise and soil-layer waves from fixed world coordinates, then subtract camera coordinates only for rendering. Never use screen coordinates as procedural shape seeds: tiny follow-camera changes caused continuous underside jitter.
- The rendering regression test records platform contour paths and compares their world positions across camera offsets and animation ticks.
