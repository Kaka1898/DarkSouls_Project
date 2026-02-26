# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev      # Start Vite dev server (hot reload)
npm run build    # Production build to dist/
```

No test framework is configured. Use Playwright (`npx playwright`) for visual testing/screenshots.

## Architecture

Vite + Three.js (^0.182.0) Souls-like 3D action game. Zero external assets — all geometry, textures, and audio are procedurally generated.

### File Dependency Graph

```
main.js  ← Game loop, camera, state machines (death/victory/fog gate), HUD updates
  ├── world.js  ← Scene infrastructure, renderer, post-processing, lighting, geometry, collision
  ├── player.js ← Player mesh, input, combat mechanics, VFX (trails, particles, damage numbers)
  ├── enemy.js  ← Regular enemy with 3-attack AI state machine
  └── boss.js   ← "Gate Knight" boss with 2-phase AI, fire pillars, positional audio
```

`world.js` is the foundational module — all others import from it. It exports: scene, renderer, camera, lights, collision functions, UI element references, geometry factories.

### Key Patterns

- **InstancedMesh batching**: ~300+ objects batched by material into InstancedMesh. Geometry is cached via `getBoxGeo(w,h,d)` / `getCylGeo(r,h,seg)`. A shared `_dummy Object3D` is used for matrix transforms.
- **Object pooling**: Damage numbers (24 DOM elements), hit particles (40 meshes), fire particles (60), fire pillars (4). Never allocate at runtime.
- **Time separation**: `rawDt` (wall clock, for visuals/fade) vs `dt * slowMoFactor` (simulation, for gameplay). Hit-stop freezes simulation but continues rendering.
- **AI state machines**: Enemy and boss use string-based `aiState` with timer-driven transitions. Boss has 16+ states across 2 phases (phase 2 triggers at 50% HP with faster timings and fire attacks).
- **Collision**: 2D XZ-plane circle/AABB system. `TERRAIN[]` for floor Y lookup, `OBSTACLES[]` for push-out. `resolveCollision(px, pz, radius)` returns corrected position.
- **Camera collision**: Raycaster from player shoulder → ideal camera position. On wall hit, camera pulls closer with faster lerp (0.35 vs 0.14). Excludes player/enemy/boss/transparent meshes.
- **Procedural textures**: 512px canvas-drawn bone and earth textures with generated normal maps (Sobel edge detection).
- **Post-processing chain**: RenderPass → SSAO → UnrealBloom → BokehPass → Vignette → OutputPass.

### Combat System (Souls-like)

- **Poise**: Both enemies and boss have poise meters. Damage reduces poise; at zero, target staggers. Poise regenerates after 2s delay.
- **Stamina**: Attacks (20), rolls (25), sprint drain stamina. Regenerates at 30/s with 0.3s delay. Exhaustion at 0 blocks actions until partial recovery.
- **I-frames**: Roll has invincibility window at frames 0.12-0.4 of 0.4s total.
- **Hit detection**: Attack progress 0.2-0.65 window, distance-based check, one hit per swing (`hitThisSwing` flag).

### World Theme: "Giant Beast Bones & Glowing Moss"

Three areas connected linearly: Main Hall → Passage → Boss Arena. Bone architecture (ribs, vertebrae, skull), glowing moss (emissive + PointLight), deep green fog (FogExp2), floating spore particles (Points + BufferGeometry).

## Conventions

- Comments are written in Japanese throughout all source files
- All SFX are procedurally synthesized via Web Audio API (oscillator + gain nodes)
- No external textures, models, or audio files — everything is generated in code
- Materials use a shared PBR environment map generated via PMREMGenerator

## ⚠️ Windows Environment Notes
- **Path Handling**: ALWAYS use double backslashes `\\` or forward slashes `/`. Never pass raw Windows paths to bash-like tools as it causes "not found" errors.
- **Fallback**: If `timeout` fails (Exit code 125), use `ping -n 4 127.0.0.1 > nul` for delays.

## Development Priorities
- **Performance**: Strictly maintain **166 FPS**. Optimize geometry and lighting for RTX 5070 Ti.
- **Combat Feel**: Prioritize weightiness (hit-stop, buffering). Stamina costs and knockback should be adjusted to feel "Soulslike" through iterative testing, rather than fixed values.