# Codex handoff — ダンゴムシころころ

## Project
- iPhone Safari playable, child-friendly, no game-over underground woodlouse rolling game.
- GitHub repository: https://github.com/sleeeepme/dango
- Production: https://dangomushi-korokoro-game.vercel.app/
- Vercel project: dangomushi-korokoro-game (prj_Tnkfk8zJyNFpufaQSPZXButAHaca)
- GitHub main is connected to Vercel production auto-deployment.
- Latest terrain update commit at handoff: a922ba6384964deb3125fd5e51fe04ecc6c6a2a4. The latest published version has flat platforms, some uneven bumps, and greater rolling friction.

## Code
- index.html: full-screen canvas and controls, no build step.
- game.js: gameplay, world generation, collision, gestures, rendering.
- Drag finger to move, quick upward flick on release launches the player, left/right buttons roll, 100% energy enables special boost.
- Woodlouse legs and antennae animate; moving caterpillars and collectibles are present.
- Camera follows depth, biomes change as the player descends.

## User priorities and constraints
1. User wants more flat terrain, occasional bumps and uneven ground, and **no continuous automatic rolling on down-slopes**. This change was just implemented but actual iPhone play-feel is not verified. Iterate based on playtesting.
2. Upward fast swipe should visibly launch the woodlouse; slow upward drag should not let it fly. Ceiling collision should bounce.
3. Preserve intuitive touch controls, smooth frame rate, and mobile Safari compatibility.
4. Deploy working updates through GitHub -> Vercel, not by replacing the whole Vercel HTML with direct deploy.
5. Avoid regressions; test JS syntax and behavior where possible, then verify deployment READY. Be explicit if real-device testing has not happened.
6. Communicate in Japanese.

## Implementation notes
- Terrain is currently generated as alternating platform segments in a for loop in game.js. The latest version replaces many sloped surfaces with horizontal sections and small height differences.
- Physics uses circle vs line-segment collision, velocity reflection, and friction; consider grounded-state logic for reliable resting on flat ground, as a future improvement.
- Existing code is minified into a single long line; refactor into readable modules when useful, but keep deployment simple.
- Do not remove gameplay features unless requested.

## Next steps
- Inspect current source and production version.
- Test on iPhone Safari, or ask user for feedback on actual play feel.
- Improve terrain variety and resting physics as necessary.
- Continue feature requests in GitHub with automatic Vercel deployments.
