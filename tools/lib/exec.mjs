// Child-process helpers. Arguments are always passed as arrays (no shell), so paths with
// Hangul and spaces never need quoting.
import { spawn } from 'node:child_process';

/**
 * Runs a command, optionally teeing output into a log stream.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, log?: import('node:stream').Writable,
 *           timeoutMs?: number, keepTail?: number }} [opts]
 * @returns {Promise<{ code: number|null, signal: string|null, stdout: string, stderr: string, tail: string }>}
 */
export function run( cmd, args, opts = {} ) {
  const { cwd, env, log, timeoutMs = 0, keepTail = 400 } = opts;
  return new Promise( ( resolve, reject ) => {
    const child = spawn( cmd, args, { cwd, env: env || process.env, stdio: [ 'ignore', 'pipe', 'pipe' ] } );
    let stdout = '';
    let stderr = '';
    /** @type {string[]} */
    const tail = [];
    const push = ( chunk, which ) => {
      const s = chunk.toString();
      if ( which === 'out' ) { stdout += s; if ( stdout.length > 4e6 ) { stdout = stdout.slice( -2e6 ); } }
      else { stderr += s; if ( stderr.length > 4e6 ) { stderr = stderr.slice( -2e6 ); } }
      if ( log ) { log.write( s ); }
      for ( const line of s.split( '\n' ) ) { if ( line.trim() ) { tail.push( line ); } }
      if ( tail.length > keepTail * 2 ) { tail.splice( 0, tail.length - keepTail ); }
    };
    child.stdout.on( 'data', c => push( c, 'out' ) );
    child.stderr.on( 'data', c => push( c, 'err' ) );
    let timer = null;
    if ( timeoutMs > 0 ) {
      timer = setTimeout( () => { child.kill( 'SIGKILL' ); }, timeoutMs );
    }
    child.on( 'error', e => { if ( timer ) { clearTimeout( timer ); } reject( e ); } );
    child.on( 'close', ( code, signal ) => {
      if ( timer ) { clearTimeout( timer ); }
      resolve( { code, signal, stdout, stderr, tail: tail.slice( -keepTail ).join( '\n' ) } );
    } );
  } );
}

/**
 * Runs a command and throws (with stderr) on a non-zero exit.
 * @param {string} cmd
 * @param {string[]} args
 * @param {Parameters<typeof run>[2]} [opts]
 * @returns {Promise<string>} trimmed stdout
 */
export async function runOk( cmd, args, opts ) {
  const r = await run( cmd, args, opts );
  if ( r.code !== 0 ) {
    const msg = ( r.stderr || r.stdout ).trim().split( '\n' ).slice( -12 ).join( '\n' );
    throw new Error( `${cmd} ${args.join( ' ' )} exited ${r.code}${r.signal ? ` (${r.signal})` : ''}: ${msg}` );
  }
  return r.stdout.trim();
}
