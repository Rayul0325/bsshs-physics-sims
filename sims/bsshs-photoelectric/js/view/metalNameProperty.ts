// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Korean names of the cathode metals, looked up by chemical symbol.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import BsshsPhotoelectricStrings from '../BsshsPhotoelectricStrings.js';
import Metal from '../model/Metal.js';

const NAMES: Record<string, TReadOnlyProperty<string>> = {
  Cs: BsshsPhotoelectricStrings.metals.CsStringProperty,
  Na: BsshsPhotoelectricStrings.metals.NaStringProperty,
  Zn: BsshsPhotoelectricStrings.metals.ZnStringProperty,
  Cu: BsshsPhotoelectricStrings.metals.CuStringProperty,
  Pt: BsshsPhotoelectricStrings.metals.PtStringProperty
};

/** The name Property of one metal. */
export function metalName( metal: Metal ): TReadOnlyProperty<string> {
  return NAMES[ metal.symbol ];
}

/** The name of whichever metal is selected. */
export default function metalNameProperty( metalProperty: TReadOnlyProperty<Metal> ): TReadOnlyProperty<string> {
  return DerivedProperty.deriveAny( [ metalProperty, ...Object.values( NAMES ) ], () => NAMES[ metalProperty.value.symbol ].value );
}

bsshsPhotoelectric.register( 'metalNameProperty', metalNameProperty );
