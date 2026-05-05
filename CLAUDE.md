# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

`@vercel/nft` (Node File Trace) is a static analysis tool that determines exactly which files are needed to run a Node.js application — including `node_modules` — without bundling. It produces a file list and dependency graph that is used to create minimal deployments (Lambda, Docker, etc.).

## Commands

```bash
npm run build          # TypeScript compilation → out/
npm test               # Run all tests (Jest)
npm run prettier-fix   # Auto-format code
npm run prettier-check # Check formatting
```

**Run a single test file or test by name:**

```bash
npm test -- test/unit.test.js
npm test -- --testNamePattern="some test name"
```

## Architecture

### Core pipeline

`nodeFileTrace(files, options)` in [src/node-file-trace.ts](src/node-file-trace.ts) creates a `Job` instance and traces from the given entry files. The `Job` orchestrates the full trace loop:

1. **analyze** (`src/analyze.ts`) — Parses JS/TS with Acorn into an AST, walks it with estree-walker, uses static-eval to evaluate simple expressions (`require('x/' + y)`, `__dirname + '/dir/'`), and emits three dependency categories: `deps` (CJS requires), `imports` (ESM), `assets` (file paths/globs).

2. **resolve** (`src/resolve-dependency.ts`) — Resolves each discovered dependency using Node.js module resolution rules: respects `package.json` `exports`/`imports`/`main` fields, export conditions (node, require, import, default, module-sync), and symlinks (with cycle detection). Also handles TypeScript path extensions.

3. **emit** — `emitFile()` in the `Job` records each file into `fileList`/`esmFileList`, stores the parent chain in `reasons`, and queues new files for processing. Special-case handling in `src/utils/special-cases.ts` and `src/utils/wrappers.ts` covers tricky packages (express engines, webpack-wrapped requires, etc.).

### Output

`nodeFileTrace()` returns `{ fileList, esmFileList, reasons, warnings }`:

- `fileList` — all files needed (relative paths)
- `esmFileList` — subset that are ES modules
- `reasons` — map from each file to `{ type, ignored, parents }` explaining why it was included
- `warnings` — array of resolution failures (non-fatal)

### Key files

| File                         | Role                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `src/index.ts`               | Public API exports                                                   |
| `src/node-file-trace.ts`     | `Job` class — trace state and orchestration                          |
| `src/analyze.ts`             | AST parsing and dependency extraction                                |
| `src/resolve-dependency.ts`  | Node.js module resolution                                            |
| `src/fs.ts`                  | `CachedFileSystem` — IO with caching and concurrency cap             |
| `src/cli.ts`                 | CLI: `build`, `print`, `size`, `why` subcommands                     |
| `src/utils/static-eval.ts`   | Pure expression evaluator (arithmetic, string concat, member access) |
| `src/utils/special-cases.ts` | Hardcoded behaviour for packages that use dynamic patterns           |
| `src/utils/wrappers.ts`      | Handles webpack-style and CJS interop wrapper patterns               |

### Tests

Tests live in `test/`. Fixtures are in `test/unit/` subdirectories — each is a small Node project used as a trace target. Coverage thresholds are enforced in `jest.config.js` (87% branches, 96% functions, 90% lines).
