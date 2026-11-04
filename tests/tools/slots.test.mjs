// Tests for bounded-parallel slot assignment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInSlots, parseSlotCount } from '../../tools/lib/slots.mjs';

const tick = ms => new Promise( r => setTimeout( r, ms ) );

test( 'runInSlots never runs more than N jobs and never shares a slot between live jobs', async () => {
  const live = new Set();
  let peak = 0;
  const items = Array.from( { length: 20 }, ( _, i ) => i );
  const results = await runInSlots( items, 4, async ( item, slot ) => {
    assert.ok( slot >= 0 && slot < 4, `slot ${slot} out of range` );
    assert.ok( !live.has( slot ), `slot ${slot} reused while busy` );
    live.add( slot );
    peak = Math.max( peak, live.size );
    await tick( 1 + ( item % 3 ) );
    live.delete( slot );
    return item * 2;
  } );
  assert.equal( peak, 4 );
  assert.deepEqual( results, items.map( i => i * 2 ) );
} );

test( 'runInSlots keeps going after a job throws and reports the error in place', async () => {
  const results = await runInSlots( [ 1, 2, 3 ], 2, async item => {
    if ( item === 2 ) { throw new Error( 'bad 2' ); }
    return item;
  } );
  assert.equal( results[ 0 ], 1 );
  assert.ok( results[ 1 ] instanceof Error );
  assert.equal( results[ 2 ], 3 );
} );

test( 'runInSlots with more slots than items uses only as many slots as items', async () => {
  const used = new Set();
  await runInSlots( [ 'a', 'b' ], 8, async ( _, slot ) => { used.add( slot ); } );
  assert.ok( [ ...used ].every( s => s < 2 ) );
} );

test( 'parseSlotCount clamps to a sane range and falls back on garbage', () => {
  assert.equal( parseSlotCount( '6', 8 ), 6 );
  assert.equal( parseSlotCount( undefined, 8 ), 8 );
  assert.equal( parseSlotCount( 'abc', 8 ), 8 );
  assert.equal( parseSlotCount( '0', 8 ), 1 );
  assert.equal( parseSlotCount( '999', 8 ), 32 );
} );
