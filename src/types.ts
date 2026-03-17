import { Job } from './node-file-trace';

export interface AssetLocation {
  start: number; // Character offset where reference starts
  end: number; // Character offset where reference ends
  source: string; // Original source code text
  type: AssetLocationType;
}

export type AssetLocationType =
  | 'fs.read' // readFileSync, readFile, createReadStream, etc.
  | 'fs.stat' // existsSync, exists, statSync, stat, etc.
  | 'fs.readdir' // readdirSync, readdir
  | 'fs.open' // open, openSync, promises.open
  | 'fs.write' // write, writeSync, appendFile, appendFileSync, etc.
  | 'fs.realpath' // realpath, realpathSync
  | 'path.join'
  | 'path.resolve'
  | 'path.relative'
  | 'path.dirname'
  | 'path.basename'
  | 'path.extname'
  | '__dirname'
  | '__filename'
  | 'import.meta.url'
  | 'require'
  | 'require.resolve'
  | 'module.require'
  | 'import'
  | 'export'
  | 'dynamic-import'
  | 'bindings'
  | 'node-gyp-build'
  | 'nbind'
  | 'glob'
  | 'other';

export interface Stats {
  isFile(): boolean;
  isDirectory(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
  isSymbolicLink(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  blksize: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;
}

export interface NodeFileTraceOptions {
  base?: string;
  processCwd?: string;
  exports?: string[];
  conditions?: string[];
  exportsOnly?: boolean;
  ignore?: string | string[] | ((path: string) => boolean);
  analysis?:
    | boolean
    | {
        emitGlobs?: boolean;
        computeFileReferences?: boolean;
        evaluatePureExpressions?: boolean;
      };
  cache?: any;
  paths?: Record<string, string>;
  ts?: boolean;
  log?: boolean;
  mixedModules?: boolean;
  readFile?: (path: string) => Promise<Buffer | string | null>;
  stat?: (path: string) => Promise<Stats | null>;
  readlink?: (path: string) => Promise<string | null>;
  resolve?: (
    id: string,
    parent: string,
    job: Job,
    cjsResolve: boolean,
  ) => Promise<string | string[]>;
  fileIOConcurrency?: number;
  depth?: number;
  trackLocations?: boolean;
}

export type NodeFileTraceReasonType =
  | 'initial'
  | 'resolve'
  | 'dependency'
  | 'asset'
  | 'sharedlib';

export interface NodeFileTraceReasons
  extends Map<
    string,
    {
      type: NodeFileTraceReasonType[];
      ignored: boolean;
      parents: Set<string>;
    }
  > {}

export interface NodeFileTraceResult {
  fileList: Set<string>;
  esmFileList: Set<string>;
  reasons: NodeFileTraceReasons;
  warnings: Set<Error>;
  assetsLocation?: Map<string, AssetLocation[]>;
}
