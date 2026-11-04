// Tests for dependencies.json parsing and dependency-set helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDependencies,
  releaseDateFromComment,
  remoteRepoFor,
  depsHash,
  versionFromComment
} from '../../tools/lib/deps.mjs';

const SAMPLE = {
  comment: '# gravity-and-orbits 1.6.27 Fri Mar 27 2026 15:38:53 GMT-0600 (Mountain Daylight Time)',
  assert: { sha: 'c13a8c7741d95fbd8e37619c66ebcca8686dffe7', branch: 'HEAD' },
  chipper: { sha: 'b5b40ba5bf6611ed34df069ba7ce99c2e8b3f3cd', branch: 'HEAD' },
  'perennial-alias': { sha: 'ed2193e5647eb6a6a9636c695c759e229b300b98', branch: 'HEAD' },
  'gravity-and-orbits': { sha: '20e204547f263cad9064831c848a73ee7e89fc41', branch: '1.6' }
};

test( 'parseDependencies returns a repo -> sha map without the comment key', () => {
  const map = parseDependencies( SAMPLE );
  assert.deepEqual( Object.keys( map ).sort(), [ 'assert', 'chipper', 'gravity-and-orbits', 'perennial-alias' ] );
  assert.equal( map.chipper, 'b5b40ba5bf6611ed34df069ba7ce99c2e8b3f3cd' );
} );

test( 'parseDependencies accepts a JSON string', () => {
  const map = parseDependencies( JSON.stringify( SAMPLE ) );
  assert.equal( map[ 'gravity-and-orbits' ], '20e204547f263cad9064831c848a73ee7e89fc41' );
} );

test( 'parseDependencies rejects malformed SHAs and missing sha fields', () => {
  assert.throws( () => parseDependencies( { chipper: { sha: 'abc', branch: 'HEAD' } } ), /sha/i );
  assert.throws( () => parseDependencies( { chipper: { branch: 'HEAD' } } ), /sha/i );
  assert.throws( () => parseDependencies( '[1,2]' ), /object/i );
} );

test( 'parseDependencies rejects repo names that could escape a directory', () => {
  assert.throws( () => parseDependencies( { '../evil': { sha: 'c13a8c7741d95fbd8e37619c66ebcca8686dffe7' } } ), /repo name/i );
} );

test( 'releaseDateFromComment parses the build timestamp with its offset', () => {
  const d = releaseDateFromComment( SAMPLE.comment );
  assert.equal( d.toISOString(), '2026-03-27T21:38:53.000Z' );
} );

test( 'releaseDateFromComment returns null when there is no timestamp', () => {
  assert.equal( releaseDateFromComment( undefined ), null );
  assert.equal( releaseDateFromComment( '# nothing here' ), null );
} );

test( 'versionFromComment extracts the released version', () => {
  assert.equal( versionFromComment( SAMPLE.comment, 'gravity-and-orbits' ), '1.6.27' );
  assert.equal( versionFromComment( SAMPLE.comment, 'other' ), null );
} );

test( 'remoteRepoFor maps perennial-alias onto the perennial repo', () => {
  assert.equal( remoteRepoFor( 'perennial-alias' ), 'perennial' );
  assert.equal( remoteRepoFor( 'chipper' ), 'chipper' );
} );

test( 'depsHash is order-independent and changes when a SHA changes', () => {
  const a = { x: 'c13a8c7741d95fbd8e37619c66ebcca8686dffe7', y: 'b5b40ba5bf6611ed34df069ba7ce99c2e8b3f3cd' };
  const b = { y: 'b5b40ba5bf6611ed34df069ba7ce99c2e8b3f3cd', x: 'c13a8c7741d95fbd8e37619c66ebcca8686dffe7' };
  assert.equal( depsHash( a ), depsHash( b ) );
  assert.match( depsHash( a ), /^[0-9a-f]{64}$/ );
  assert.notEqual( depsHash( a ), depsHash( { ...a, x: 'b5b40ba5bf6611ed34df069ba7ce99c2e8b3f3cd' } ) );
} );

test( 'isPrivatePhetioRepo matches only the closed PhET-iO repos', async () => {
  const { isPrivatePhetioRepo } = await import( '../../tools/lib/deps.mjs' );
  for ( const r of [ 'phet-io', 'phet-io-wrappers', 'phet-io-sim-specific', 'phet-io-website', 'studio' ] ) {
    assert.equal( isPrivatePhetioRepo( r ), true, r );
  }
  for ( const r of [ 'tandem', 'chipper', 'phetcommon', 'phetmarks', 'studio-x' ] ) {
    assert.equal( isPrivatePhetioRepo( r ), false, r );
  }
} );
