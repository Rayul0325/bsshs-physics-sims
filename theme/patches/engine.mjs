// Applies allow-listed patch rules to a slot checkout and reverts them.
//
// A rule names ONE sibling repo, a list of candidate repo-relative files, and either regex edits or a
// whole-file replacement. Rules transform the pristine committed content (`git show HEAD:<file>`), never
// the working copy left by an earlier call, so applying twice gives the same files (idempotent) and
// `git checkout --` restores the checkout exactly. Within ONE call, a second rule on a file an earlier
// rule already wrote builds on that rule's output. Every touched file is pushed to `touched` BEFORE it
// is written, so the caller's `finally` can revert even when a later rule throws.
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';

/**
 * @typedef {object} PatchEdit
 * @property {RegExp} find - what to look for in the PhET file (use the g flag to replace every hit)
 * @property {string|((env: object, ...match: string[]) => string)} replace
 * @property {boolean} [optional] - true: a file without this anchor is still fine
 */

/**
 * @typedef {object} PatchRule
 * @property {string} id
 * @property {'theme'|'brand'|'telemetry'|'terms'} kind - the only allowed patch purposes (invariant 9; terms = Korean string fixes)
 * @property {string} repo - sibling directory in the slot
 * @property {string[]} files - candidate repo-relative files
 * @property {'first'|'all'} [match] - patch the first existing candidate (default) or all existing ones
 * @property {PatchEdit[]} [edits]
 * @property {(env: object, old: Buffer) => (string|Buffer)} [content] - whole-file replacement
 * @property {boolean} required - true: the build fails when no candidate exists or an edit does not match
 * @property {string} why - one line for reviewers
 */

/**
 * Applies one rule to one file's content (pure; used by the build and by the dry run over git blobs).
 * @param {PatchRule} rule
 * @param {Buffer} content - pristine file content
 * @param {object} ctx - values from the tokens/brand (see theme/patches/index.mjs)
 * @param {string} file - repo-relative path of the file
 * @returns {{ content: Buffer, changed: boolean, counts: number[], missing: number[] }}
 */
export function transformFile( rule, content, ctx, file ) {
  const env = { ...ctx, file, isTs: /\.ts$/.test( file ) };
  if ( rule.content ) {
    const out = rule.content( env, content );
    const buf = Buffer.isBuffer( out ) ? out : Buffer.from( out, 'utf8' );
    return { content: buf, changed: !buf.equals( content ), counts: [ 1 ], missing: [] };
  }
  let text = content.toString( 'utf8' );
  const counts = [];
  const missing = [];
  ( rule.edits || [] ).forEach( ( edit, i ) => {
    let n = 0;
    text = text.replace( edit.find, ( ...args ) => {
      n++;
      const groups = args.slice( 0, -2 ).filter( a => typeof a !== 'object' );
      return typeof edit.replace === 'function' ? edit.replace( env, ...groups ) :
             edit.replace.replace( /\$(\d)/g, ( _, d ) => groups[ Number( d ) ] ?? '' );
    } );
    counts.push( n );
    if ( n === 0 && !edit.optional ) { missing.push( i ); }
  } );
  const buf = Buffer.from( text, 'utf8' );
  return { content: buf, changed: !buf.equals( content ), counts, missing };
}

/**
 * @param {string} dir
 * @param {string} file
 * @returns {Promise<Buffer>} committed content of `file` at HEAD
 */
function gitShowHead( dir, file ) {
  return new Promise( ( resolve, reject ) => {
    execFile( 'git', [ '-C', dir, 'show', `HEAD:${file}` ], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
      ( err, stdout ) => ( err ? reject( new Error( `git show HEAD:${file} in ${dir}: ${err.message}` ) ) : resolve( stdout ) ) );
  } );
}

/**
 * @param {string} dir
 * @param {string} file
 * @returns {Promise<boolean>} true when `file` (exact case) is tracked at HEAD
 */
function gitHasFile( dir, file ) {
  return new Promise( resolve => {
    execFile( 'git', [ '-C', dir, 'cat-file', '-e', `HEAD:${file}` ], err => resolve( !err ) );
  } );
}

/**
 * Applies rules in a slot. Returns one result per rule; throws when a required rule cannot apply.
 * @param {string} slotRoot
 * @param {PatchRule[]} rules
 * @param {object} ctx
 * @param {{dir: string, file: string}[]} touched - receives every file written (for revertTouched)
 * @returns {Promise<{ id: string, kind: string, status: 'applied'|'skipped', files: string[], detail: string }[]>}
 */
export async function applyPatchRules( slotRoot, rules, ctx, touched ) {
  const results = [];
  // Content this call already wrote, so two rules aimed at the same file compose instead of the
  // later one starting from pristine HEAD again and silently undoing the earlier one.
  /** @type {Map<string, Buffer>} */
  const written = new Map();
  for ( const rule of rules ) {
    const repoDir = path.join( slotRoot, rule.repo );
    // Existence is asked of git, not the filesystem: macOS is case-insensitive, so
    // js/updateCheck.js would "exist" where only js/UpdateCheck.js is tracked.
    const existing = [];
    for ( const f of rule.files ) {
      if ( existsSync( repoDir ) && await gitHasFile( repoDir, f ) ) { existing.push( f ); }
    }
    const targets = rule.match === 'all' ? existing : existing.slice( 0, 1 );
    if ( !targets.length ) {
      if ( rule.required ) { throw new Error( `patch ${rule.id}: none of ${rule.repo}/{${rule.files.join( ',' )}} exists` ); }
      results.push( { id: rule.id, kind: rule.kind, status: 'skipped', files: [], detail: 'no candidate file' } );
      continue;
    }
    const done = [];
    const notes = [];
    for ( const file of targets ) {
      const base = written.get( `${repoDir}\0${file}` ) || await gitShowHead( repoDir, file );
      const r = transformFile( rule, base, ctx, file );
      if ( r.missing.length ) {
        if ( rule.required ) { throw new Error( `patch ${rule.id}: anchor(s) #${r.missing.join( ',#' )} not found in ${rule.repo}/${file}` ); }
        notes.push( `${file}: anchor(s) #${r.missing.join( ',#' )} not found` );
        if ( !r.changed ) { continue; }
      }
      if ( !r.changed ) { notes.push( `${file}: no change` ); continue; }
      if ( !touched.some( t => t.dir === repoDir && t.file === file ) ) { touched.push( { dir: repoDir, file } ); }
      await writeFile( path.join( repoDir, file ), r.content );
      written.set( `${repoDir}\0${file}`, r.content );
      done.push( `${rule.repo}/${file}` );
      notes.push( `${file}: ${rule.content ? 'replaced' : `edits ${r.counts.join( '/' )}`}` );
    }
    if ( !done.length && rule.required ) { throw new Error( `patch ${rule.id}: nothing changed (${notes.join( '; ' )})` ); }
    results.push( { id: rule.id, kind: rule.kind, status: done.length ? 'applied' : 'skipped', files: done, detail: notes.join( '; ' ) } );
  }
  return results;
}

/**
 * Restores every touched file from git (tracked files only; rules never add files).
 * @param {{dir: string, file: string}[]} touched
 */
export async function revertTouched( touched ) {
  for ( const t of touched ) {
    await new Promise( ( resolve, reject ) => {
      execFile( 'git', [ '-C', t.dir, 'checkout', '--', t.file ], err => ( err ? reject( err ) : resolve() ) );
    } );
  }
}

/**
 * One-line summary of a rule result for the build matrix.
 * @param {{ id: string, status: string, detail: string }} r
 * @returns {string}
 */
export const describeResult = r => `${r.id}: ${r.status}${r.detail ? ` (${r.detail})` : ''}`;
