/**
 * Location tracking tests for nodeFileTrace({ trackLocations: true }).
 *
 * Each test writes a minimal code string, traces it with depth:1, and
 * verifies that source.slice(loc.start, loc.end) equals the path expression
 * and source.slice(loc.callStart, loc.callEnd) equals the outer call expression.
 */

const path = require('path');
const { nodeFileTrace } = require('../out/node-file-trace');

const FIXTURE_FILE = path.resolve(__dirname, '__loc_fixture__.js');
const BASE = path.dirname(FIXTURE_FILE);
const REL = path.basename(FIXTURE_FILE); // 'relative' key in fileLocations

/**
 * Trace a code string as if it were FIXTURE_FILE.
 * Returns the FileLocationResult for that file.
 */
async function traceCode(code, extraOpts = {}) {
  const result = await nodeFileTrace([FIXTURE_FILE], {
    base: BASE,
    depth: 1,
    trackLocations: true,
    readFile: async (p) => (p === FIXTURE_FILE ? code : null),
    stat: async (p) => {
      if (p === FIXTURE_FILE)
        return {
          isFile: () => true,
          isDirectory: () => false,
          dev: 0,
          ino: 0,
          mode: 0o644,
          nlink: 1,
          uid: 0,
          gid: 0,
          rdev: 0,
          size: code.length,
          blksize: 4096,
          blocks: 8,
          atimeMs: 0,
          mtimeMs: 0,
          ctimeMs: 0,
          birthtimeMs: 0,
          atime: new Date(0),
          mtime: new Date(0),
          ctime: new Date(0),
          birthtime: new Date(0),
        };
      // Return a minimal stat for anything else so asset checks pass
      return null;
    },
    ...extraOpts,
  });
  return { locs: result.fileLocations?.get(REL), result };
}

/** Assert a location's start/end match a substring of source. */
function expectSlice(source, loc, expectedArg, expectedCall) {
  expect(source.slice(loc.start, loc.end)).toBe(expectedArg);
  if (expectedCall !== undefined) {
    expect(source.slice(loc.callStart, loc.callEnd)).toBe(expectedCall);
  }
}

// ---------------------------------------------------------------------------
// 1. require()
// ---------------------------------------------------------------------------

describe('require() location tracking', () => {
  it('tracks static require with string literal', async () => {
    const code = `const x = require('some-module');`;
    const { locs } = await traceCode(code);
    expect(locs).toBeDefined();
    const arr = locs.depLocations.get('some-module');
    expect(arr).toBeDefined();
    expect(arr).toHaveLength(1);
    const loc = arr[0];
    expect(loc.type).toBe('require');
    expectSlice(code, loc, `'some-module'`, `require('some-module')`);
  });

  it('tracks require with double-quoted string', async () => {
    const code = `const x = require("lodash");`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('lodash');
    expect(arr).toHaveLength(1);
    expectSlice(code, arr[0], `"lodash"`, `require("lodash")`);
  });

  it('tracks multiple requires in same file', async () => {
    const code = `const a = require('mod-a');\nconst b = require('mod-b');`;
    const { locs } = await traceCode(code);
    expect(locs.depLocations.get('mod-a')).toHaveLength(1);
    expect(locs.depLocations.get('mod-b')).toHaveLength(1);
  });

  it('tracks same module required twice', async () => {
    const code = `const a = require('mod');\nconst b = require('mod');`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('mod');
    expect(arr).toHaveLength(2);
    expect(arr[0].type).toBe('require');
    expect(arr[1].type).toBe('require');
  });
});

// ---------------------------------------------------------------------------
// 2. module.require()
// ---------------------------------------------------------------------------

describe('module.require() location tracking', () => {
  it('tracks module.require()', async () => {
    const code = `const x = module.require('some-module');`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('require');
    expectSlice(code, arr[0], `'some-module'`, `module.require('some-module')`);
  });
});

// ---------------------------------------------------------------------------
// 3. require.resolve()
// ---------------------------------------------------------------------------

describe('require.resolve() location tracking', () => {
  it('tracks require.resolve()', async () => {
    const code = `const p = require.resolve('some-module');`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('require-resolve');
    expectSlice(
      code,
      arr[0],
      `'some-module'`,
      `require.resolve('some-module')`,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. ESM import declarations
// ---------------------------------------------------------------------------

describe('ESM import location tracking', () => {
  it('tracks static import declaration', async () => {
    const code = `import foo from 'some-module';`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('import');
    expectSlice(
      code,
      arr[0],
      `'some-module'`,
      `import foo from 'some-module';`,
    );
  });

  it('tracks named import', async () => {
    const code = `import { a, b } from 'some-module';`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('import');
  });

  it('tracks side-effect import', async () => {
    const code = `import 'some-module';`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('import');
    expectSlice(code, arr[0], `'some-module'`, `import 'some-module';`);
  });

  it('tracks re-export from', async () => {
    const code = `export { foo } from 'some-module';`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('import');
    expectSlice(
      code,
      arr[0],
      `'some-module'`,
      `export { foo } from 'some-module';`,
    );
  });

  it('tracks export * from', async () => {
    const code = `export * from 'some-module';`;
    const { locs } = await traceCode(code);
    const arr = locs.depLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('import');
  });
});

// ---------------------------------------------------------------------------
// 5. dynamic import()
// ---------------------------------------------------------------------------

describe('dynamic import() location tracking', () => {
  it('tracks dynamic import with string literal', async () => {
    const code = `const m = import('some-module');`;
    const { locs } = await traceCode(code);
    const arr = locs.importLocations.get('some-module');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('dynamic-import');
    expectSlice(code, arr[0], `'some-module'`, `import('some-module')`);
  });
});

// ---------------------------------------------------------------------------
// 6. fs.* location tracking
// ---------------------------------------------------------------------------

describe('fs.* location tracking', () => {
  it('tracks fs.readFileSync with __dirname', async () => {
    const code = [
      `const fs = require('fs');`,
      `const path = require('path');`,
      `fs.readFileSync(path.join(__dirname, 'config.json'));`,
    ].join('\n');
    const { locs } = await traceCode(code);
    // The resolved asset key is the absolute path
    const entries = [...locs.assetLocations.entries()];
    const entry = entries.find(([k]) => k.endsWith('config.json'));
    expect(entry).toBeDefined();
    const [key, arr] = entry;
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('fs');
    // The arg is the path.join(...) expression
    expect(code.slice(arr[0].start, arr[0].end)).toBe(
      `path.join(__dirname, 'config.json')`,
    );
    // The call is the fs.readFileSync(...) call
    expect(code.slice(arr[0].callStart, arr[0].callEnd)).toBe(
      `fs.readFileSync(path.join(__dirname, 'config.json'))`,
    );
  });

  it('tracks fs.readFileSync with string literal', async () => {
    const code = [
      `const fs = require('fs');`,
      `fs.readFileSync('/absolute/path/to/file.txt');`,
    ].join('\n');
    const { locs } = await traceCode(code);
    const entry = [...locs.assetLocations.entries()].find(([k]) =>
      k.endsWith('file.txt'),
    );
    expect(entry).toBeDefined();
    const [, arr] = entry;
    expect(arr[0].type).toBe('fs');
    expect(code.slice(arr[0].start, arr[0].end)).toBe(
      `'/absolute/path/to/file.txt'`,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. path.join / path.resolve with __dirname as asset
// ---------------------------------------------------------------------------

describe('path.join/__dirname asset location tracking', () => {
  it('tracks path.join(__dirname, ...) as an asset reference', async () => {
    const code = [
      `const path = require('path');`,
      `const p = path.join(__dirname, 'data', 'file.json');`,
    ].join('\n');
    const { locs } = await traceCode(code);
    const entry = [...locs.assetLocations.entries()].find(([k]) =>
      k.endsWith('file.json'),
    );
    expect(entry).toBeDefined();
    const [, arr] = entry;
    expect(arr[0].type).toBe('path-join');
    expect(code.slice(arr[0].start, arr[0].end)).toBe(
      `path.join(__dirname, 'data', 'file.json')`,
    );
  });

  it('tracks path.resolve(__dirname, ...) as an asset reference', async () => {
    const code = [
      `const path = require('path');`,
      `const p = path.resolve(__dirname, 'data', 'file.json');`,
    ].join('\n');
    const { locs } = await traceCode(code);
    const entry = [...locs.assetLocations.entries()].find(([k]) =>
      k.endsWith('file.json'),
    );
    expect(entry).toBeDefined();
    const [, arr] = entry;
    expect(arr[0].type).toBe('path-resolve');
  });
});

// ---------------------------------------------------------------------------
// 8. new URL() with import.meta.url
// ---------------------------------------------------------------------------

describe('new URL() location tracking', () => {
  it('tracks new URL() with import.meta.url', async () => {
    const code = `const u = new URL('./asset.wasm', import.meta.url);`;
    const { locs } = await traceCode(code);
    const entry = [...locs.assetLocations.entries()].find(([k]) =>
      k.endsWith('asset.wasm'),
    );
    expect(entry).toBeDefined();
    const [, arr] = entry;
    expect(arr[0].type).toBe('new-url');
    // The arg is the './asset.wasm' string
    expect(code.slice(arr[0].start, arr[0].end)).toBe(`'./asset.wasm'`);
    // The call is the new URL(...) expression
    expect(code.slice(arr[0].callStart, arr[0].callEnd)).toBe(
      `new URL('./asset.wasm', import.meta.url)`,
    );
  });
});

// ---------------------------------------------------------------------------
// 9. module.register() / module.createRequire()
// ---------------------------------------------------------------------------

describe('module.register() location tracking', () => {
  it('tracks module.register() with bare specifier', async () => {
    const code = `import { register } from 'node:module';\nregister('some-loader');`;
    const { locs } = await traceCode(code);
    const arr = locs.importLocations.get('some-loader');
    expect(arr).toHaveLength(1);
    expect(arr[0].type).toBe('module-register');
  });
});

// ---------------------------------------------------------------------------
// 10. Verifies trackLocations: false produces no fileLocations
// ---------------------------------------------------------------------------

describe('trackLocations option', () => {
  it('does not produce fileLocations when trackLocations is false', async () => {
    const code = `const x = require('some-module');`;
    const result = await nodeFileTrace([FIXTURE_FILE], {
      base: BASE,
      depth: 1,
      trackLocations: false,
      readFile: async (p) => (p === FIXTURE_FILE ? code : null),
      stat: async () => null,
    });
    expect(result.fileLocations).toBeUndefined();
  });

  it('does not produce fileLocations when trackLocations is omitted', async () => {
    const code = `const x = require('some-module');`;
    const result = await nodeFileTrace([FIXTURE_FILE], {
      base: BASE,
      depth: 1,
      readFile: async (p) => (p === FIXTURE_FILE ? code : null),
      stat: async () => null,
    });
    expect(result.fileLocations).toBeUndefined();
  });
});
