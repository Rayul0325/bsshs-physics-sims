// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * A cathode metal the student can choose. Work functions are representative literature values for clean
 * polycrystalline surfaces, in eV; measured values depend on the surface and differ by a few tenths of an eV
 * between sources, so these are typical class values, not a single authority's numbers.
 */

import bsshsPhotoelectric from '../bsshsPhotoelectric.js';

export default class Metal {

  /**
   * @param symbol - chemical symbol, also the id the drawer adapter uses ('Cs', 'Na', ...)
   * @param workFunction - in eV
   */
  public constructor( public readonly symbol: string, public readonly workFunction: number ) {}

  public static readonly CESIUM = new Metal( 'Cs', 2.14 );
  public static readonly SODIUM = new Metal( 'Na', 2.28 );
  public static readonly ZINC = new Metal( 'Zn', 4.33 );
  public static readonly COPPER = new Metal( 'Cu', 4.65 );
  public static readonly PLATINUM = new Metal( 'Pt', 5.65 );

  /** In order of increasing work function (the order of the radio buttons). */
  public static readonly ALL: readonly Metal[] = [ Metal.CESIUM, Metal.SODIUM, Metal.ZINC, Metal.COPPER, Metal.PLATINUM ];
}

bsshsPhotoelectric.register( 'Metal', Metal );
