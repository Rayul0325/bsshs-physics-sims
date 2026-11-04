// Bounded parallelism over a fixed set of sibling-checkout slots.
// Each live job owns one slot index exclusively, because every sim pins different
// dependency SHAs and a slot is a whole sibling tree checked out at those SHAs.

/**
 * Runs `worker(item, slot)` over `items` with at most `slotCount` jobs at once.
 * A slot index is handed to exactly one live job at a time. Errors are captured
 * in place (the result array holds the Error) so one failure does not stop the rest.
 * @template T, R
 * @param {T[]} items
 * @param {number} slotCount
 * @param {(item: T, slot: number) => Promise<R>} worker
 * @returns {Promise<Array<R|Error>>}
 */
export async function runInSlots( items, slotCount, worker ) {
  const results = new Array( items.length );
  const n = Math.max( 1, Math.min( slotCount, items.length ) );
  let next = 0;
  const lane = async slot => {
    while ( next < items.length ) {
      const i = next++;
      try {
        results[ i ] = await worker( items[ i ], slot );
      }
      catch( e ) {
        results[ i ] = e instanceof Error ? e : new Error( String( e ) );
      }
    }
  };
  await Promise.all( Array.from( { length: n }, ( _, slot ) => lane( slot ) ) );
  return results;
}

/**
 * Parses a slot-count option, clamped to [1, 32].
 * @param {string|undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
export function parseSlotCount( raw, fallback ) {
  const n = Number.parseInt( raw ?? '', 10 );
  if ( Number.isNaN( n ) ) { return fallback; }
  return Math.max( 1, Math.min( 32, n ) );
}
