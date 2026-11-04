// Slope units shown under a linear fit (drawer/core.js slopeUnit).
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../drawer/core.js';

const { slopeUnit } = globalThis.BsshsDrawerCore;

test( 'slope unit of y over x', () => {
  assert.equal( slopeUnit( 'eV', 'Hz' ), 'eV/Hz' );
  assert.equal( slopeUnit( 'ms', '/s' ), 'ms·s' ); // reciprocal x unit multiplies, no "ms//s"
  assert.equal( slopeUnit( '', '/s' ), 's' );
  assert.equal( slopeUnit( 'V', 'm/s' ), 'V/(m/s)' );
  assert.equal( slopeUnit( 'W', '' ), 'W' );
  assert.equal( slopeUnit( '', 'm' ), '1/m' );
  assert.equal( slopeUnit( '', '' ), '' );
} );
