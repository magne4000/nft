import { resolve, dirname, relative } from 'path';
import { existsSync } from 'fs';
import resolveDependency from '../resolve-dependency';
import { getPackageName } from './get-package-base';
import { readFileSync } from 'graceful-fs';
import { Job } from '../node-file-trace';
import { Ast, Node as LocNode } from './types';
type Node = Ast['body'][0];

// The asset paths emitted by these handlers are computed from package-specific
// knowledge, not from a literal in the source. The closest source anchor is the
// `require()` that pulled the package in, so locations are reported against it.
function isRequireCall(node: Node | null | undefined): boolean {
  return (
    !!node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require'
  );
}

function firstRequireCall(ast: Ast): LocNode | undefined {
  for (const statement of ast.body) {
    // require('x') / module.exports = require('x')
    if (statement.type === 'ExpressionStatement') {
      const expr = statement.expression;
      if (isRequireCall(expr)) return expr as unknown as LocNode;
      if (expr.type === 'AssignmentExpression' && isRequireCall(expr.right))
        return expr.right as unknown as LocNode;
    }
    // const x = require('x')
    if (statement.type === 'VariableDeclaration') {
      for (const decl of statement.declarations) {
        if (isRequireCall(decl.init)) return decl.init as unknown as LocNode;
      }
    }
  }
  return undefined;
}

const specialCases: Record<string, (o: SpecialCaseOpts) => void> = {
  '@generated/photon'({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('@generated/photon/index.js')) {
      emitAssetDirectory(
        resolve(dirname(id), 'runtime/'),
        firstRequireCall(ast),
      );
    }
  },
  '@serialport/bindings-cpp'({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('@serialport/bindings-cpp/dist/index.js')) {
      const node = firstRequireCall(ast);
      emitAssetDirectory(resolve(dirname(id), '..', 'build', 'Release'), node);
      emitAssetDirectory(resolve(dirname(id), '..', 'prebuilds'), node);
    }
  },
  argon2({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('argon2/argon2.js')) {
      const node = firstRequireCall(ast);
      emitAssetDirectory(resolve(dirname(id), 'build', 'Release'), node);
      emitAssetDirectory(resolve(dirname(id), 'prebuilds'), node);
      emitAssetDirectory(resolve(dirname(id), 'lib', 'binding'), node);
    }
  },
  bull({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('bull/lib/commands/index.js')) {
      emitAssetDirectory(resolve(dirname(id)), firstRequireCall(ast));
    }
  },
  camaro({ id, ast, emitAsset }) {
    if (id.endsWith('camaro/dist/camaro.js')) {
      emitAsset(resolve(dirname(id), 'camaro.wasm'), firstRequireCall(ast));
    }
  },
  esbuild({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('esbuild/lib/main.js')) {
      const node = firstRequireCall(ast);
      const file = resolve(id, '..', '..', 'package.json');
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      for (const dep of Object.keys(pkg.optionalDependencies || {})) {
        const dir = resolve(id, '..', '..', '..', dep);
        emitAssetDirectory(dir, node);
      }
    }
  },
  'ffmpeg-static'({ id, ast, emitAsset }) {
    if (id.endsWith('ffmpeg-static/index.js')) {
      const dir = dirname(id);
      const ext = process.platform === 'win32' ? '.exe' : '';
      const binaryPath = [
        resolve(dir, `ffmpeg${ext}`),
        resolve(dir, 'bin', process.platform, process.arch, `ffmpeg${ext}`),
      ].find((file) => existsSync(file));
      if (binaryPath) {
        emitAsset(binaryPath, firstRequireCall(ast));
      }
    }
  },
  'google-gax'({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('google-gax/build/src/grpc.js')) {
      // const googleProtoFilesDir = path.normalize(google_proto_files_1.getProtoPath('..'));
      // ->
      // const googleProtoFilesDir = resolve(__dirname, '../../../google-proto-files');
      for (const statement of ast.body) {
        if (
          statement.type === 'VariableDeclaration' &&
          statement.declarations[0].id.type === 'Identifier' &&
          statement.declarations[0].id.name === 'googleProtoFilesDir'
        ) {
          emitAssetDirectory(
            resolve(dirname(id), '../../../google-proto-files'),
            firstRequireCall(ast),
          );
        }
      }
    }
  },
  oracledb({ id, ast, emitAsset }) {
    if (id.endsWith('oracledb/lib/oracledb.js')) {
      for (const statement of ast.body) {
        if (
          statement.type === 'ForStatement' &&
          'body' in statement.body &&
          statement.body.body &&
          Array.isArray(statement.body.body) &&
          statement.body.body[0] &&
          statement.body.body[0].type === 'TryStatement' &&
          statement.body.body[0].block.body[0] &&
          statement.body.body[0].block.body[0].type === 'ExpressionStatement' &&
          statement.body.body[0].block.body[0].expression.type ===
            'AssignmentExpression' &&
          statement.body.body[0].block.body[0].expression.operator === '=' &&
          statement.body.body[0].block.body[0].expression.left.type ===
            'Identifier' &&
          statement.body.body[0].block.body[0].expression.left.name ===
            'oracledbCLib' &&
          statement.body.body[0].block.body[0].expression.right.type ===
            'CallExpression' &&
          statement.body.body[0].block.body[0].expression.right.callee.type ===
            'Identifier' &&
          statement.body.body[0].block.body[0].expression.right.callee.name ===
            'require' &&
          statement.body.body[0].block.body[0].expression.right.arguments
            .length === 1 &&
          statement.body.body[0].block.body[0].expression.right.arguments[0]
            .type === 'MemberExpression' &&
          statement.body.body[0].block.body[0].expression.right.arguments[0]
            .computed === true &&
          statement.body.body[0].block.body[0].expression.right.arguments[0]
            .object.type === 'Identifier' &&
          statement.body.body[0].block.body[0].expression.right.arguments[0]
            .object.name === 'binaryLocations' &&
          statement.body.body[0].block.body[0].expression.right.arguments[0]
            .property.type === 'Identifier' &&
          statement.body.body[0].block.body[0].expression.right.arguments[0]
            .property.name === 'i'
        ) {
          const requireCall = statement.body.body[0].block.body[0].expression
            .right as unknown as LocNode;
          statement.body.body[0].block.body[0].expression.right.arguments = [
            { type: 'Literal', value: '_' },
          ];
          const version = (global as any)._unit
            ? '3.0.0'
            : JSON.parse(
                readFileSync(id.slice(0, -15) + 'package.json', 'utf8'),
              ).version;
          const useVersion =
            Number(version.slice(0, version.indexOf('.'))) >= 4;
          const binaryName =
            'oracledb-' +
            (useVersion ? version : 'abi' + process.versions.modules) +
            '-' +
            process.platform +
            '-' +
            process.arch +
            '.node';
          emitAsset(
            resolve(id, '../../build/Release/' + binaryName),
            requireCall,
          );
        }
      }
    }
  },
  'phantomjs-prebuilt'({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('phantomjs-prebuilt/lib/phantomjs.js')) {
      emitAssetDirectory(
        resolve(dirname(id), '..', 'bin'),
        firstRequireCall(ast),
      );
    }
  },
  'remark-prism'({ id, ast, emitAssetDirectory }) {
    const file = 'remark-prism/src/highlight.js';
    if (id.endsWith(file)) {
      try {
        const node_modules = id.slice(0, -file.length);
        emitAssetDirectory(
          resolve(node_modules, 'prismjs', 'components'),
          firstRequireCall(ast),
        );
      } catch (e) {
        // fail silently
      }
    }
  },
  semver({ id, ast, emitAsset }) {
    if (id.endsWith('semver/index.js')) {
      // See https://github.com/npm/node-semver/blob/master/CHANGELOG.md#710
      emitAsset(
        resolve(id.replace('index.js', 'preload.js')),
        firstRequireCall(ast),
      );
    }
  },
  sharp: async ({ id, ast, emitAssetDirectory, job }) => {
    if (id.endsWith('sharp/lib/index.js')) {
      const node = firstRequireCall(ast);
      const file = resolve(id, '..', '..', 'package.json');
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      for (const dep of Object.keys(pkg.optionalDependencies || {})) {
        const dir = resolve(id, '..', '..', '..', dep);
        emitAssetDirectory(dir, node);

        try {
          const file = resolve(dir, 'package.json');
          const pkg = JSON.parse(readFileSync(file, 'utf8'));
          for (const innerDep of Object.keys(pkg.optionalDependencies || {})) {
            const innerDir = resolve(
              await job.realpath(dir),
              '..',
              '..',
              innerDep,
            );
            emitAssetDirectory(innerDir, node);
          }
        } catch (err: any) {
          if (err && err.code !== 'ENOENT') {
            console.error(
              `Error reading "sharp" dependencies from "${dir}/package.json"'`,
            );
            throw err;
          }
        }
      }
    }
  },
  shiki({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('/dist/index.js')) {
      const node = firstRequireCall(ast);
      emitAssetDirectory(resolve(dirname(id), '..', 'languages'), node);
      emitAssetDirectory(resolve(dirname(id), '..', 'themes'), node);
    }
  },
  'socket.io': async function ({ id, ast, job }) {
    if (id.endsWith('socket.io/lib/index.js')) {
      async function replaceResolvePathStatement(statement: Node) {
        if (
          statement.type === 'ExpressionStatement' &&
          statement.expression.type === 'AssignmentExpression' &&
          statement.expression.operator === '=' &&
          statement.expression.right.type === 'CallExpression' &&
          statement.expression.right.callee.type === 'Identifier' &&
          statement.expression.right.callee.name === 'read' &&
          statement.expression.right.arguments.length >= 1 &&
          statement.expression.right.arguments[0].type === 'CallExpression' &&
          statement.expression.right.arguments[0].callee.type ===
            'Identifier' &&
          statement.expression.right.arguments[0].callee.name ===
            'resolvePath' &&
          statement.expression.right.arguments[0].arguments.length === 1 &&
          statement.expression.right.arguments[0].arguments[0].type ===
            'Literal'
        ) {
          const arg =
            statement.expression.right.arguments[0].arguments[0].value;
          let resolved: string;
          try {
            const dep = await resolveDependency(String(arg), id, job);
            if (typeof dep === 'string') {
              resolved = dep;
            } else {
              return undefined;
            }
          } catch (e) {
            return undefined;
          }
          // The asset relocator will then pick up the AST rewriting from here
          const relResolved = '/' + relative(dirname(id), resolved);
          statement.expression.right.arguments[0] = {
            type: 'BinaryExpression',
            // @ts-ignore Its okay if start is undefined
            start: statement.expression.right.arguments[0].start,
            // @ts-ignore Its okay if end is undefined
            end: statement.expression.right.arguments[0].end,
            operator: '+',
            left: {
              type: 'Identifier',
              name: '__dirname',
            },
            right: {
              type: 'Literal',
              value: relResolved,
              raw: JSON.stringify(relResolved),
            },
          };
        }
        return undefined;
      }

      for (const statement of ast.body) {
        if (
          statement.type === 'ExpressionStatement' &&
          statement.expression.type === 'AssignmentExpression' &&
          statement.expression.operator === '=' &&
          statement.expression.left.type === 'MemberExpression' &&
          statement.expression.left.object.type === 'MemberExpression' &&
          statement.expression.left.object.object.type === 'Identifier' &&
          statement.expression.left.object.object.name === 'Server' &&
          statement.expression.left.object.property.type === 'Identifier' &&
          statement.expression.left.object.property.name === 'prototype' &&
          statement.expression.left.property.type === 'Identifier' &&
          statement.expression.left.property.name === 'serveClient' &&
          statement.expression.right.type === 'FunctionExpression'
        ) {
          for (const node of statement.expression.right.body.body) {
            if (
              node.type === 'IfStatement' &&
              node.consequent &&
              'body' in node.consequent &&
              node.consequent.body
            ) {
              const ifBody = node.consequent.body;
              let replaced: boolean | undefined = false;
              if (
                Array.isArray(ifBody) &&
                ifBody[0] &&
                ifBody[0].type === 'ExpressionStatement'
              ) {
                replaced = await replaceResolvePathStatement(ifBody[0]);
              }
              if (
                Array.isArray(ifBody) &&
                ifBody[1] &&
                ifBody[1].type === 'TryStatement' &&
                ifBody[1].block.body &&
                ifBody[1].block.body[0]
              ) {
                replaced =
                  (await replaceResolvePathStatement(
                    ifBody[1].block.body[0],
                  )) || replaced;
              }
              return;
            }
          }
        }
      }
    }
  },
  typescript({ id, ast, emitAssetDirectory }) {
    if (id.endsWith('typescript/lib/tsc.js')) {
      emitAssetDirectory(resolve(id, '../'), firstRequireCall(ast));
    }
  },
  'uglify-es'({ id, ast, emitAsset }) {
    if (id.endsWith('uglify-es/tools/node.js')) {
      const node = firstRequireCall(ast);
      emitAsset(resolve(id, '../../lib/utils.js'), node);
      emitAsset(resolve(id, '../../lib/ast.js'), node);
      emitAsset(resolve(id, '../../lib/parse.js'), node);
      emitAsset(resolve(id, '../../lib/transform.js'), node);
      emitAsset(resolve(id, '../../lib/scope.js'), node);
      emitAsset(resolve(id, '../../lib/output.js'), node);
      emitAsset(resolve(id, '../../lib/compress.js'), node);
      emitAsset(resolve(id, '../../lib/sourcemap.js'), node);
      emitAsset(resolve(id, '../../lib/mozilla-ast.js'), node);
      emitAsset(resolve(id, '../../lib/propmangle.js'), node);
      emitAsset(resolve(id, '../../lib/minify.js'), node);
      emitAsset(resolve(id, '../exports.js'), node);
    }
  },
  'uglify-js'({ id, ast, emitAsset, emitAssetDirectory }) {
    if (id.endsWith('uglify-js/tools/node.js')) {
      const node = firstRequireCall(ast);
      emitAssetDirectory(resolve(id, '../../lib'), node);
      emitAsset(resolve(id, '../exports.js'), node);
    }
  },
  'playwright-core'({ id, ast, emitAsset }) {
    if (id.endsWith('playwright-core/index.js')) {
      emitAsset(resolve(dirname(id), 'browsers.json'), firstRequireCall(ast));
    }
  },
  'geo-tz'({ id, ast, emitAsset }) {
    if (id.endsWith('geo-tz/dist/geo-tz.js')) {
      emitAsset(resolve(dirname(id), '../data/geo.dat'), firstRequireCall(ast));
    }
  },
  pixelmatch({ id, ast, emitDependency }) {
    if (id.endsWith('pixelmatch/index.js')) {
      emitDependency(
        resolve(dirname(id), 'bin/pixelmatch'),
        firstRequireCall(ast),
      );
    }
  },
  'geoip-lite'({ id, ast, emitAsset }) {
    if (id.endsWith('geoip-lite/lib/geoip.js')) {
      const node = firstRequireCall(ast);
      emitAsset(resolve(dirname(id), '../data/geoip-city.dat'), node);
      emitAsset(resolve(dirname(id), '../data/geoip-city6.dat'), node);
      emitAsset(resolve(dirname(id), '../data/geoip-city-names.dat'), node);
      emitAsset(resolve(dirname(id), '../data/geoip-country.dat'), node);
      emitAsset(resolve(dirname(id), '../data/geoip-country6.dat'), node);
    }
  },
};

interface SpecialCaseOpts {
  id: string;
  ast: Ast;
  emitDependency: (filename: string, node?: LocNode) => void;
  emitAsset: (filename: string, node?: LocNode) => void;
  emitAssetDirectory: (dirname: string, node?: LocNode) => void;
  job: Job;
}

export default async function handleSpecialCases({
  id,
  ast,
  emitDependency,
  emitAsset,
  emitAssetDirectory,
  job,
}: SpecialCaseOpts) {
  const pkgName = getPackageName(id);
  const specialCase = specialCases[pkgName || ''];
  id = id.replace(/\\/g, '/');
  if (specialCase)
    await specialCase({
      id,
      ast,
      emitDependency,
      emitAsset,
      emitAssetDirectory,
      job,
    });
}
