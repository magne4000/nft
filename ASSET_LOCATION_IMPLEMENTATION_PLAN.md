### Supported Ways to Find Assets and Implementation Status

This document lists all the ways `@vercel/nft` identifies assets and indicates whether asset location tracking is currently implemented for each mechanism.

#### 1. Static Expression Evaluation (Backtracking)

- [x] **Triggers**: `__dirname`, `__filename`, `import.meta.url`.
- [x] **Custom Triggers**: Defined via the `[TRIGGER]` symbol in `knownBindings`.
- [x] **Assignments**: Tracking absolute paths during variable/constant assignment (e.g., `const asset = '/path/to/file'`).

#### 2. Built-in Method Call Triggers

- [x] **`fs` and `fs.promises` Methods**: `readFile`, `stat`, `exists`, `readdir`, `open`, `writeFile`, `realpath`, etc.
- [x] **`path` Methods**: `path.join`, `path.resolve`, `path.relative`, `path.dirname`, `path.basename`, `path.extname`.
- [x] **Dependency Resolvers**: `require.resolve`, `require`, `bindings`, `node-gyp-build`, `nbind`.
- [ ] **Native Bindings**: `nbind.init` (Resolves `.node` bindings, currently uses `deps.add` without location tracking).
- [ ] **Package Info**: `require('pkginfo')(module)` (Automatically loads `package.json`, currently no location tracking).
- [ ] **Express Templates**: `app.set("view engine", ...)` and `app.engine(...)` (Monitored for template engine requires, currently no location tracking).
- [x] **Strong Globalize**: `setRootRootDir` (Emits the `intl` folder via `emitAssetDirectory`).
- [x] **Module Creation**: `module.createRequire(path)` and `new module.Module(path)` (Tracked as `BOUND_REQUIRE`, subsequent calls are handled like `require`).

#### 3. Globbing and Wildcards

- [x] **Wildcard Require**: Dynamic requires like `require('./path/' + variable)`. Locations are tracked using the `require` call node.
- [x] **Asset Directory**: Emitting all files in a directory via `emitAssetDirectory`. Locations are tracked using either an explicitly provided node or the `staticChildNode` (the expression that resolved to the directory path).

#### 4. Special Case Manual Emissions

- [x] **Package-Specific Logic**: Handlers in `src/utils/special-cases.ts` for packages like `argon2`, `sharp`, `shiki`, `oracledb`, `playwright-core`, `geo-tz`, `geoip-lite`, `pixelmatch`, etc.
- [x] **Node Attribution**: Most special cases now provide the relevant AST node for precise location tracking.

#### 5. Fallback and Uncategorized ('other' type)

- [ ] **Unrecognized Function Calls**: Assets identified but passed to functions not explicitly handled in `determineAssetLocationType`.
- [ ] **Missing AST Context**: Cases where an asset is emitted without a direct link to an AST node or a `staticChildNode` (e.g., fallback in `emitAssetPath`).
- [ ] **Complex Side-Effects**: Emissions triggered by logic not directly traceable to a specific expression.
- [ ] **Environment Variables**: `process.env.VARIABLE` when statically evaluated to a path (handled by `static-eval`, currently location tracking depends on how it's used).
