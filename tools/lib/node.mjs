// Node.js toolchain selection. The default is the Node running this script; other majors come from fnm.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run, runOk } from './exec.mjs';
import { cacheDir } from './paths.mjs';

const FNM_CANDIDATES = [ '/opt/homebrew/bin/fnm', '/usr/local/bin/fnm' ];

/** @returns {string} */
function fnmBinary() {
  return FNM_CANDIDATES.find( p => existsSync( p ) ) || 'fnm';
}

const cache = new Map();

/**
 * Finds a node binary for `major` (installing it through fnm if needed).
 * @param {number} major
 * @returns {Promise<{ binDir: string, nodePath: string, version: string }>}
 */
export function resolveNode( major ) {
  if ( !cache.has( major ) ) {
    cache.set( major, ( async () => {
      if ( Number( process.versions.node.split( '.' )[ 0 ] ) === major ) {
        return { binDir: path.dirname( process.execPath ), nodePath: process.execPath, version: process.version };
      }
      const fnm = fnmBinary();
      const probe = () => run( fnm, [ 'exec', `--using=${major}`, '--', 'node', '-p', 'process.execPath + " " + process.version' ] );
      let r = await probe();
      if ( r.code !== 0 ) {
        await runOk( fnm, [ 'install', String( major ) ] );
        r = await probe();
      }
      if ( r.code !== 0 ) { throw new Error( `could not provide Node ${major} via fnm: ${r.stderr.trim()}` ); }
      const [ nodePath, version ] = r.stdout.trim().split( '\n' ).pop().split( ' ' );
      return { binDir: path.dirname( nodePath ), nodePath, version };
    } )() );
  }
  return cache.get( major );
}

/**
 * Environment for running a toolchain: that node's bin dir first on PATH (so npm and any
 * nested `node` calls use it), a private npm cache, browser downloads disabled, and a larger heap.
 * @param {string} binDir
 * @returns {NodeJS.ProcessEnv}
 */
export function toolchainEnv( binDir ) {
  return {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    PUPPETEER_SKIP_DOWNLOAD: '1',
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: '1',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    NODE_OPTIONS: '--max-old-space-size=8192',
    // Private npm cache inside the source cache: self-contained and never touches ~/.npm.
    npm_config_cache: path.join( cacheDir(), 'npm-cache' ),
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false'
  };
}
