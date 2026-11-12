# Contributing to scratchsembly

Thanks for helping improve scratchsembly. Issues and pull requests are welcome at [Michjzuman/scratchsembly](https://github.com/Michjzuman/scratchsembly).

## Development setup

Use Node.js 22.12+ (22.x), or 24+, and npm:

```sh
npm ci
npx playwright install chromium
npm run dev
```

The development server runs at http://localhost:5173. The application has no backend. Projects and preferences are stored locally in the browser.

## Before submitting a change

```sh
npm run format
npm run build
npm test
npm run test:e2e
npm run test:pages
npm audit
```

Vitest covers CPU behavior, expression lowering, previews, migrations, and block schema. Playwright covers desktop and mobile interaction, including real pointer-based dragging. English-default journeys and explicit saved-German-language journeys both matter.

`npm run test:pages` builds and serves the production bundle under `/scratchsembly/`, checking that media, native workers, and the English interface work without the development server. `.github/workflows/pages.yml` runs unit and production-path browser checks before deploying pushes to `main` to GitHub Pages.

Optional native assembly tests require NASM for x86/x86_64 and Clang for ARM/AArch64. If a tool is unavailable, only its corresponding integration tests are skipped. Installing both lets you verify every target's emitted source.

For bug reports, include the selected architecture, language, theme, browser, expected behavior, and reproduction steps. A minimal `.scratchsembly.json` project is useful; review it for information you do not want to share before uploading it.

## Design and compatibility expectations

- Keep the editor Scratch-like and purposeful. Do not add stage/sprite decoration or dashboard clutter. Read [the interface design notes](docs/interface-design.md) before changing interactions.
- English is the default. Keep German and Assembly presentation modes working. Do not silently overwrite saved language choices or translate user-defined project/label names.
- Architecture is a project property, not a presentation preference. ARM, AArch64, x86, and x86_64 must remain coherent across blocks, execution, registers, stack, and export.
- Preserve compatibility with old project files and storage keys. Migrations must be idempotent and must not alter existing program behavior.
- Use exact integer handling for 64-bit values. Do not introduce JavaScript floating-point rounding into literals, previews, CPU state, or serialization.
- Keep reporter previews read-only. One visible step executes a complete statement atomically; failures must not expose partial register, flag, memory, or PC changes.
- Keep generated assembly native and assemblable. Do not replace instruction lowering with a hidden JavaScript evaluator or an `EVAL` pseudo-instruction.
- Document simulator and native-export limitations honestly.

When adding or extending an instruction, update lowering, native execution, preview semantics where relevant, tooltips, assembler integration tests, and architecture-specific browser coverage together. Include desktop and mobile interaction tests when changing drag targets, palette behavior, register layout, or dialogs.

Use English for new documentation, comments, test descriptions, and public-facing project metadata. Localized German strings and German-language test fixtures are expected exceptions. Prefer focused changes and explain any intentional behavior or compatibility changes in the pull request.

## Code map

- `src/block-model.ts`: Blockly schema, palette, expression inputs, event sections.
- `src/architectures.ts`, `src/registers.ts`: target profiles and register aliases.
- `src/engine/`: native lowering, execution, and read-only preview evaluation.
- `src/components/BlockEditor.tsx`: editor integration and pointer interactions.
- `src/components/RuntimePanel.tsx`: register/stack display and execution controls.
- `src/i18n.ts`: language defaults and message localization.
- `e2e/`: browser tests; see `e2e/helpers.ts` for fresh-English and explicit German fixtures.

See [README.md](README.md) for the full feature set, architecture details, and simulation boundaries.
