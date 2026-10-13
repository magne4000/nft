const fs = require('fs');
const os = require('os');
const path = require('path');
const { nodeFileTrace } = require('../out/node-file-trace');

let base;
beforeEach(() => {
  base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'nft-locations-')),
  );
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

// Writes `files` (path relative to base → content) and traces `entry` with
// location tracking. Returns the location maps recorded for `entry`.
async function trace(entry, files, opts = {}) {
  for (const [file, content] of Object.entries(files)) {
    const abs = path.join(base, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  const result = await nodeFileTrace([path.join(base, entry)], {
    base,
    depth: 1,
    trackLocations: true,
    ...opts,
  });
  return result.fileLocations.get(entry);
}

// Source slices of every location recorded under `key`.
function slices(code, map, key) {
  return (map.get(key) || []).map((l) => ({
    type: l.type,
    arg: code.slice(l.start, l.end),
    call:
      l.callStart === undefined
        ? undefined
        : code.slice(l.callStart, l.callEnd),
  }));
}

const abs = (rel) => path.join(base, rel);

describe('trackLocations', () => {
  it('is opt-in', async () => {
    fs.writeFileSync(abs('index.js'), `require('a');`);
    const result = await nodeFileTrace([abs('index.js')], { base, depth: 1 });
    expect(result.fileLocations).toBeUndefined();
  });

  (process.platform === 'win32' ? it.skip : it)(
    'keys a symlinked file by its real path, like fileList',
    async () => {
      fs.mkdirSync(abs('lib'));
      fs.writeFileSync(abs('lib/real.js'), `require('a');`);
      fs.symlinkSync(abs('lib/real.js'), abs('index.js'));
      const result = await nodeFileTrace([abs('index.js')], {
        base,
        depth: 1,
        trackLocations: true,
      });
      const key = path.join('lib', 'real.js');
      expect(result.fileList.has(key)).toBe(true);
      expect([...result.fileLocations.keys()]).toEqual([key]);
    },
  );

  it('records require, module.require and require.resolve', async () => {
    const code = `require('a');\nmodule.require('b');\nrequire.resolve('c');`;
    const { depLocations } = await trace('index.js', { 'index.js': code });
    expect(slices(code, depLocations, 'a')).toEqual([
      { type: 'require', arg: `'a'`, call: `require('a')` },
    ]);
    expect(slices(code, depLocations, 'b')).toEqual([
      { type: 'require', arg: `'b'`, call: `module.require('b')` },
    ]);
    expect(slices(code, depLocations, 'c')).toEqual([
      { type: 'require-resolve', arg: `'c'`, call: `require.resolve('c')` },
    ]);
  });

  it('records each distinct reference to the same specifier', async () => {
    const code = `require('a');\nrequire("a");`;
    const { depLocations } = await trace('index.js', { 'index.js': code });
    expect(slices(code, depLocations, 'a').map((s) => s.arg)).toEqual([
      `'a'`,
      `"a"`,
    ]);
  });

  it('records ESM imports, re-exports and dynamic imports', async () => {
    const code = `import a from 'a';\nexport * from 'b';\nimport('c');`;
    const { depLocations, importLocations } = await trace('index.mjs', {
      'index.mjs': code,
    });
    expect(slices(code, depLocations, 'a')).toEqual([
      { type: 'import', arg: `'a'`, call: `import a from 'a';` },
    ]);
    expect(slices(code, depLocations, 'b')).toEqual([
      { type: 'import', arg: `'b'`, call: `export * from 'b';` },
    ]);
    expect(slices(code, importLocations, 'c')).toEqual([
      { type: 'dynamic-import', arg: `'c'`, call: `import('c')` },
    ]);
  });

  it('records module.register()', async () => {
    const code = `import { register } from 'node:module';\nregister('loader');`;
    const { importLocations } = await trace('index.mjs', { 'index.mjs': code });
    expect(slices(code, importLocations, 'loader')).toEqual([
      { type: 'module-register', arg: `'loader'`, call: `register('loader')` },
    ]);
  });

  it('records pino transport targets and express view engines', async () => {
    const code = `const pino = require('pino');\npino.transport({ target: 'pino-pretty' });\nconst express = require('express');\nconst app = express();\napp.set('view engine', 'pug');`;
    const { depLocations } = await trace('index.js', { 'index.js': code });
    expect(slices(code, depLocations, 'pino-pretty')).toEqual([
      {
        type: 'pino-transport',
        arg: `'pino-pretty'`,
        call: `pino.transport({ target: 'pino-pretty' })`,
      },
    ]);
    expect(slices(code, depLocations, 'pug')).toEqual([
      {
        type: 'express-view-engine',
        arg: `'pug'`,
        call: `app.set('view engine', 'pug')`,
      },
    ]);
  });

  it('keeps offsets intact for files starting with a shebang', async () => {
    const code = `#!/usr/bin/env node\nrequire('a');`;
    const { depLocations } = await trace('index.js', { 'index.js': code });
    expect(slices(code, depLocations, 'a')).toEqual([
      { type: 'require', arg: `'a'`, call: `require('a')` },
    ]);
  });

  it('records an fs call argument once', async () => {
    const code = `const fs = require('fs');\nconst path = require('path');\nfs.readFileSync(path.join(__dirname, 'data.json'));`;
    const { assetLocations } = await trace('index.js', {
      'index.js': code,
      'data.json': '{}',
    });
    expect(slices(code, assetLocations, 'data.json')).toEqual([
      {
        type: 'fs',
        arg: `path.join(__dirname, 'data.json')`,
        call: `fs.readFileSync(path.join(__dirname, 'data.json'))`,
      },
    ]);
  });

  it('records path.join and path.resolve expressions once', async () => {
    const code = `const path = require('path');\nconst a = path.join(__dirname, 'a.txt');\nconst b = path.resolve(__dirname, 'b.txt');`;
    const { assetLocations } = await trace('index.js', {
      'index.js': code,
      'a.txt': '',
      'b.txt': '',
    });
    expect(slices(code, assetLocations, 'a.txt')).toEqual([
      {
        type: 'path-join',
        arg: `path.join(__dirname, 'a.txt')`,
        call: undefined,
      },
    ]);
    expect(slices(code, assetLocations, 'b.txt')).toEqual([
      {
        type: 'path-resolve',
        arg: `path.resolve(__dirname, 'b.txt')`,
        call: undefined,
      },
    ]);
  });

  it('records each element of an array of paths', async () => {
    const code = `const path = require('path');\nconst files = [path.join(__dirname, 'a.txt'), path.join(__dirname, 'b.txt')];`;
    const { assetLocations } = await trace('index.js', {
      'index.js': code,
      'a.txt': '',
      'b.txt': '',
    });
    for (const file of ['a.txt', 'b.txt'])
      expect(slices(code, assetLocations, file)).toEqual([
        {
          type: 'path-join',
          arg: `path.join(__dirname, '${file}')`,
          call: undefined,
        },
      ]);
  });

  it('labels other static path expressions as expression', async () => {
    const code = `const path = require('path');\nconst a = __dirname + '/a.txt';\nconst files = [path.join(__dirname, 'b.txt'), __dirname + '/c.txt'];\nconst d = path.join(__dirname, 'd') + '.txt';`;
    const { assetLocations } = await trace('index.js', {
      'index.js': code,
      'a.txt': '',
      'b.txt': '',
      'c.txt': '',
      'd.txt': '',
    });
    const labels = Object.fromEntries(
      ['a.txt', 'b.txt', 'c.txt', 'd.txt'].map((file) => [
        file,
        slices(code, assetLocations, file),
      ]),
    );
    expect(labels).toEqual({
      'a.txt': [
        { type: 'expression', arg: `__dirname + '/a.txt'`, call: undefined },
      ],
      'b.txt': [
        {
          type: 'path-join',
          arg: `path.join(__dirname, 'b.txt')`,
          call: undefined,
        },
      ],
      'c.txt': [
        { type: 'expression', arg: `__dirname + '/c.txt'`, call: undefined },
      ],
      'd.txt': [
        {
          type: 'expression',
          arg: `path.join(__dirname, 'd') + '.txt'`,
          call: undefined,
        },
      ],
    });
  });

  it('records the specifier of new URL(..., import.meta.url)', async () => {
    const code = `const u = new URL('./a.wasm', import.meta.url);`;
    const { assetLocations } = await trace('index.mjs', {
      'index.mjs': code,
      'a.wasm': '',
    });
    expect(slices(code, assetLocations, 'a.wasm')).toEqual([
      {
        type: 'new-url',
        arg: `'./a.wasm'`,
        call: `new URL('./a.wasm', import.meta.url)`,
      },
    ]);
  });

  it('records both branches of a conditional path', async () => {
    const code = `const fs = require('fs');\nfs.readFileSync(process.env.X ? __dirname + '/a.txt' : __dirname + '/b.txt');`;
    const { assetLocations } = await trace('index.js', {
      'index.js': code,
      'a.txt': '',
      'b.txt': '',
    });
    const arg = `process.env.X ? __dirname + '/a.txt' : __dirname + '/b.txt'`;
    for (const file of ['a.txt', 'b.txt'])
      expect(slices(code, assetLocations, file)).toEqual([
        { type: 'fs', arg, call: `fs.readFileSync(${arg})` },
      ]);
  });

  it('does not record a module referencing itself as an asset', async () => {
    const cjs = await trace('index.js', {
      'index.js': `console.log(__filename);`,
    });
    expect([...cjs.assetLocations.keys()]).toEqual([]);
    const esm = await trace('index.mjs', {
      'index.mjs': `import { createRequire } from 'module';\nconst req = createRequire(import.meta.url);`,
    });
    expect([...esm.assetLocations.keys()]).toEqual([]);
  });

  it('does not record references to files that are not emitted', async () => {
    const code = `const fs = require('fs');\nfs.readFileSync(__dirname + '/missing.txt');`;
    const { assetLocations } = await trace('index.js', { 'index.js': code });
    expect([...assetLocations.keys()]).toEqual([]);
  });

  it('records a referenced directory on each emitted file', async () => {
    const code = `const fs = require('fs');\nfs.readdirSync(__dirname + '/dir');`;
    const { assetLocations } = await trace('index.js', {
      'index.js': code,
      'dir/a.txt': '',
      'dir/b.txt': '',
    });
    const expected = [
      {
        type: 'fs',
        arg: `__dirname + '/dir'`,
        call: `fs.readdirSync(__dirname + '/dir')`,
      },
    ];
    const a = path.join('dir', 'a.txt');
    const b = path.join('dir', 'b.txt');
    expect(slices(code, assetLocations, a)).toEqual(expected);
    expect(slices(code, assetLocations, b)).toEqual(expected);
    expect([...assetLocations.keys()].sort()).toEqual([a, b]);
  });

  it('records fs.readdirSync(__dirname) on each emitted file', async () => {
    const code = `require('fs').readdirSync(__dirname);`;
    const { assetLocations } = await trace('lib/index.js', {
      'lib/index.js': code,
      'lib/a.txt': '',
    });
    const expected = [
      {
        type: 'fs',
        arg: '__dirname',
        call: `require('fs').readdirSync(__dirname)`,
      },
    ];
    // the module's own file is part of the listing too
    for (const file of ['a.txt', 'index.js'])
      expect(slices(code, assetLocations, path.join('lib', file))).toEqual(
        expected,
      );
  });

  it('does not attribute fs.readdirSync(__dirname) to the next expression', async () => {
    const code = `const path = require('path');\nfoo(require('fs').readdirSync(__dirname), path.join(__dirname, '../a.txt'));`;
    const { assetLocations } = await trace('lib/index.js', {
      'lib/index.js': code,
      'a.txt': '',
    });
    const locs = slices(code, assetLocations, 'a.txt');
    expect(locs).toHaveLength(1);
    expect(locs[0].arg).toBe(`path.join(__dirname, '../a.txt')`);
    expect(locs[0].call).toBeUndefined();
  });

  it('keys a computed local require as a relative specifier', async () => {
    const code = `require(__dirname + '/../x.js');`;
    const { depLocations } = await trace('lib/index.js', {
      'lib/index.js': code,
      'x.js': '',
    });
    expect([...depLocations.keys()]).toEqual(['../x.js']);
  });

  it('records a wildcard require on each matched file', async () => {
    const code = `const lang = process.env.LANG;\nrequire('./locales/' + lang + '.js');`;
    const { depLocations } = await trace('index.js', {
      'index.js': code,
      'locales/en.js': '',
      'locales/fr.js': '',
    });
    const expected = [
      {
        type: 'glob',
        arg: `'./locales/' + lang + '.js'`,
        call: `require('./locales/' + lang + '.js')`,
      },
    ];
    expect(slices(code, depLocations, './locales/en.js')).toEqual(expected);
    expect(slices(code, depLocations, './locales/fr.js')).toEqual(expected);
    expect([...depLocations.keys()].sort()).toEqual([
      './locales/en.js',
      './locales/fr.js',
    ]);
  });

  it('keys an nbind binding as a relative specifier', async () => {
    const code = `require('nbind').init(__dirname);`;
    const { depLocations } = await trace('index.js', {
      'index.js': code,
      'build/Release/nbind.node': '',
    });
    expect(slices(code, depLocations, './build/Release/nbind.node')).toEqual([
      { type: 'nbind', arg: '__dirname', call: code.slice(0, -1) },
    ]);
  });

  it('records bindings() and node-gyp-build() arguments', async () => {
    const bindingsCode = `require('bindings')('addon');`;
    const gypCode = `require('node-gyp-build')(__dirname);`;
    const files = {
      'node_modules/a/index.js': bindingsCode,
      'node_modules/a/build/Release/addon.node': '',
      'node_modules/b/index.js': gypCode,
      'node_modules/b/build/Release/addon.node': '',
    };
    const a = await trace('node_modules/a/index.js', files);
    expect(
      slices(
        bindingsCode,
        a.assetLocations,
        path.join('node_modules', 'a', 'build', 'Release', 'addon.node'),
      ),
    ).toEqual([
      { type: 'bindings', arg: `'addon'`, call: bindingsCode.slice(0, -1) },
    ]);
    const b = await trace('node_modules/b/index.js', {});
    expect(
      slices(
        gypCode,
        b.assetLocations,
        path.join('node_modules', 'b', 'build', 'Release', 'addon.node'),
      ),
    ).toEqual([
      { type: 'node-gyp-build', arg: '__dirname', call: gypCode.slice(0, -1) },
    ]);
  });

  it('records no location for special-case package assets', async () => {
    const entry = require.resolve('shiki');
    const root = path.resolve(__dirname, '..');
    const { fileList, fileLocations } = await nodeFileTrace([entry], {
      base: root,
      trackLocations: true,
    });
    const languages = [...fileList].filter((f) =>
      f.includes(`shiki${path.sep}languages${path.sep}`),
    );
    expect(languages.length).toBeGreaterThan(0);
    const { assetLocations } = fileLocations.get(path.relative(root, entry));
    for (const file of languages) expect(assetLocations.has(file)).toBe(false);
  });

  it('keeps changes to returned locations out of a shared cache', async () => {
    const code = `require('a');`;
    const cache = {};
    const first = await trace('index.js', { 'index.js': code }, { cache });
    first.depLocations.get('a')[0].start = 0;
    first.depLocations.get('a').push({ start: 0, end: 1, type: 'require' });
    const second = await trace('index.js', {}, { cache });
    expect(slices(code, second.depLocations, 'a')).toEqual([
      { type: 'require', arg: `'a'`, call: `require('a')` },
    ]);
  });

  it('drops asset locations ignored by a job sharing the cache', async () => {
    const code = `require('fs').readFileSync(__dirname + '/a.txt');`;
    const files = { 'index.js': code, 'a.txt': '' };
    const cache = {};
    await trace('index.js', files, { cache });
    const { assetLocations } = await trace('index.js', files, {
      cache,
      ignore: ['a.txt'],
    });
    expect([...assetLocations.keys()]).toEqual([]);
  });

  it('re-analyzes files cached by a run without trackLocations', async () => {
    const code = `require('a');`;
    fs.writeFileSync(abs('index.js'), code);
    const cache = {};
    await nodeFileTrace([abs('index.js')], { base, depth: 1, cache });
    const { depLocations } = await trace('index.js', {}, { cache });
    expect(slices(code, depLocations, 'a')).toHaveLength(1);
  });
});
