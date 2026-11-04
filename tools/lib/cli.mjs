// Small CLI helpers shared by the tools.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * True when the module at `metaUrl` is the process entry point (works with non-ASCII paths).
 * @param {string} metaUrl - import.meta.url of the caller
 * @returns {boolean}
 */
export function isMain( metaUrl ) {
  return !!process.argv[ 1 ] && fileURLToPath( metaUrl ) === path.resolve( process.argv[ 1 ] );
}
