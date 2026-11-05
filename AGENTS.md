# Solver | Agent Reference

Photo of an exam question → an AI teacher's narrated "video" lesson: Turkish voice-over while a pen
highlights, underlines, strikes and writes on the photo and draws figures on a side board, synced
word by word.

## Tech Stack

- **App**: Expo 57 (React Native 0.86, React 19.2), expo-router, NativeWind 4, TanStack Query
- **Backend**: Expo Router API routes (`src/app/api/**/+api.ts`) — no separate server yet
- **AI**: Vercel AI SDK with a provider registry (`shared/server/ai`); lesson models Gemini 4 Argon
  (default, Opus fallback), Claude Opus 5.5, Claude Sonnet 5.5 (`LESSON_MODELS`, pinnable per lesson)
- **OCR**: Google Cloud Vision `DOCUMENT_TEXT_DETECTION` (word polygons)
- **TTS**: Gemini speech model chain on quota errors, then OpenAI `gpt-4o-mini-tts`
  (`shared/server/tts`; `TTS_PROVIDER=openai` skips Gemini)
- **Player**: Expo DOM component (`'use dom'`) with Video.js 10, roughjs sketches, KaTeX
- **Lint/Format**: Biome 2 · **Package manager**: Bun · **Types**: TypeScript 6

## Architecture: Feature-Sliced Design

```
src/
├── app/        # expo-router routes; each route file IS the screen (no pages layer)
│   └── api/    # API routes — thin: parse request, call a slice's server/, respond
├── app-shell/  # FSD app layer: bootstrap side effects, providers, startup hook
├── widgets/    # composite blocks (lesson-player)
├── features/   # user actions (create-lesson: pick photo → generate)
├── entities/   # domain data + its display UI (lesson: types, queries, history)
└── shared/     # no domain knowledge: ui, lib, api client, server infra (ai, ocr, tts)
```

| Layer | May import from |
|-------|-----------------|
| `app`, `app-shell` | everything below |
| `widgets` | `features`, `entities`, `shared` |
| `features` | `entities`, `shared` |
| `entities` | `shared` |
| `shared` | nothing above |

Biome (`biome.json` overrides) enforces it: no upward imports, no imports between slices of the
same layer, cross-slice imports only through the slice's `index.ts`, relative imports inside a slice.

### Screens

Route files hold the screen directly (`export default function LessonPage()`), no re-exports.
Keep them thin (~100 lines): they compose widgets/features/entities. Anything bigger or reusable
moves into a slice — never put non-route files under `src/app` (expo-router treats every file
there as a route).

### Server code

- Server-only code lives in `<slice>/server/` (and infra in `shared/server/`).
- Client code may never import `**/server/**` — Biome errors. Only API routes, other server
  modules and `scripts/` may.
- A slice's server API has its own barrel (`features/create-lesson/server/index.ts`); the slice's
  main `index.ts` never re-exports server code.
- Secrets come from `@/shared/server/env` (typed with t3-env). Never read `process.env` directly,
  never prefix secrets with `EXPO_PUBLIC_`.
- Server modules import entity **types** only (`import type`), so no React Native code is pulled
  into the server bundle.

### Lesson pipeline (`features/create-lesson/server`)

`OCR → solve → lesson script (+ repair) → region boxes → TTS per step → join on one track →
resolve actions` (`planLesson` runs everything before speech; `createLesson` the rest).

- **Solve** (`solve-question.agent.ts`): tool loop with `calculate` (sandboxed mathjs,
  `shared/server/math`) and `run_code` (QuickJS sandbox, 3 s / 32 MB, `shared/server/code`),
  then an answer ↔ option-verdict consistency check with one retry. Successful `run_code`
  outputs go to the script stage, which may show one real check on the board.
- **Prompts** are XML-sectioned with short reasoned rules; the board guide sent to the teacher
  is routed by the solution's `subject` (`board/guide.ts`). The lesson marks the correct option
  and stops — no option-by-option elimination.
- **Answer formats**: the solver sets `format` — `choice` (A–E), `open` (no options; the result is
  boxed on the board) or `proof` (full proof on the board). Open/proof lessons end with
  `reveal_answer` option `null`; the player stamps the result or "∎ İspat tamam".
- **Tools on the lesson**: `lesson.tools` lists what the video really shows (board kinds used,
  plus `code` when a real solver check is shown); the catalog tags come from it.
- **Script** (`lesson-script.agent.ts`): the teacher model only sees OCR word **ids**
  (`[w12]karmaşık`), never coordinates; `lib/locate.ts` turns ids into rectangles. Action timing
  comes from `at` quotes matched against word timings (`lib/find-spoken-time.ts`).
  `lib/validate-script.ts` checks ids, quotes, the revealed answer and every figure; errors go
  back to the model for up to 2 repair rounds.
- **Regions**: parts of a photo's drawing with no OCR word are described in English and located
  by Gemini `box_2d` (`locate-regions.agent.ts`).
- **Pen colors**: red by default; blue/green/purple/orange only to match or tell items apart.
  Highlight is always yellow.
- **Temporary drawings**: every drawing action has `temporary`; true makes it fade when its
  step's narration ends (`endMs`), so only what the student still needs stays on screen.

No caching: every photo is generated fresh. A lesson's photo, narration track and JSON are
stored in `.data/lessons/<id>/` (`lesson-store.ts`); clearing the history in the app deletes them.

### Board figures (`features/create-lesson/server/board`)

The model writes `draw` actions: `{figure, kind, spec}` with `spec` a JSON string per kind
(`construct`, `solid`, `plot`, `table`, `numberLine`, `signTable`, `venn`, `tree`, `chart`,
`motion`, `forces`, `timeline`, `map`, `circuit`). `map` draws Türkiye (provinces, regions, rivers, lakes) or
the world (countries, continents, reference lines) from prebuilt JSON in `board/maps/`
(`scripts/build-maps.py`; geoBoundaries CC BY-SA 2.0 + Natural Earth). Draws sharing a figure id build one figure step by step. The server validates each
spec (Zod) and renders the whole figure to SVG paths and texts in figure units (1000 wide, y
down); the player only animates them. `construct` is an in-house geometry kernel (points from
coordinates, polar offsets, midpoints, feet, intersections, fitted to the board). A figure that
fails to render is dropped whole and its error feeds the repair loop.
`bun scripts/board-preview.ts <out.html>` renders sample specs for eyeballing.

AI file naming: `<name>.agent.ts` (prompt + model call), `<name>.schema.ts` (Zod output schema).
Prompts are English and ask for Turkish output; schema `.describe()` texts are part of the prompt.

### Player (`widgets/lesson-player`)

- `ui/lesson-player.dom.tsx` is the only `'use dom'` file; everything it imports runs in a
  WebView, so it's plain React DOM + CSS (`ui/player-styles.ts`), no NativeWind.
- The media clock is the single source of truth: `lib/timeline.ts#sceneAt(ms)` decides what's
  drawn and `lib/ink.ts` how far each stroke (and the pen tip) has got, so pause, speed and
  seeking need no extra state. Shapes are single-stroke: the pen traces every stroke.
- Photo drawings are SVG in image-pixel space inside the zoomed canvas, so zoom never misplaces
  them. Board figures are SVGs in figure units; the board takes half the screen once used and
  stacks notes and figures, following the latest.
- One pen font everywhere the pen writes (`--hand` in `ui/player-styles.ts`, Shantell Sans):
  math is written as Unicode (x², √3, ≤); KaTeX only lays out real fractions/roots, with its
  letters and digits switched to the same font.

## Conventions

- Files `kebab-case`; named exports everywhere except route files (default export, `<Name>Page`).
- Declaration order: imports → exports/main component → local components → helpers →
  constants → types, separated by `// ── Section ───` banners when a file has 2+ sections.
- Code and comments in English; user-facing strings in Turkish.
- Styling: `className` with tokens from `shared/lib/app-tokens.ts`; merge with `cn()`.
  Third-party components need `cssInterop` (`shared/lib/nativewind-interop.ts`).

## Test set and example catalog

`scripts/questions/yks-2026/` (ÖSYM 2026) and `tubitak-2024/` (TÜBİTAK olympiad) hold cropped
questions (gitignored: copyrighted — internal testing only, never ship or publish them).

The Örnekler tab lists a catalog (TYT / AYT / ZOR — olympiad questions, both stages) from `.data/catalog/` (`entities/example`).
`scripts/examples.json` is its source (exam, subject, topic, answer key; open/proof answers are text):
`bun scripts/build-catalog.ts` copies images into the catalog, keeping generated lesson ids.
Argon lessons are pre-generated (`bun scripts/generate-examples.ts argon [--only ids]`, checks
answers against the key and prints tokens ≈ $ per lesson); Opus/Sonnet are generated on demand from the question screen
(`POST /api/examples/<id>/generate`).

## Commands

```sh
bun start                                   # Expo dev server (API routes included)
bun lesson scripts/questions/turkish.png    # run the pipeline without the app
bun apk                                     # release APK against kovanacademy.com → ~/Desktop/solver.apk
                                            #   (after app.json / native changes: bunx expo prebuild -p android --clean)
bun t                                       # typecheck
bun check / bun check:fix                   # Biome
node --env-file=.env.local scripts/ocr.mjs scripts/questions/sets.png   # OCR comparison
```
