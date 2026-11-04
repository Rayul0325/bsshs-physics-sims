// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Typed access to this sim's strings. Values come from bsshs-template-strings_en.json, which holds the
 * Korean text directly (chipper bundles that file as the fallback for every locale, including ko).
 * Keep StringsType in sync with the JSON by hand: one entry per key, "<key>StringProperty".
 */

import getStringModule from '../../chipper/js/browser/getStringModule.js';
import type LocalizedStringProperty from '../../chipper/js/browser/LocalizedStringProperty.js';
import bsshsTemplate from './bsshsTemplate.js';

type StringsType = {
  'bsshs-template': {
    'titleStringProperty': LocalizedStringProperty;
  };
  'screen': {
    'mainStringProperty': LocalizedStringProperty;
  };
  'sideLengthStringProperty': LocalizedStringProperty;
  'areaStringProperty': LocalizedStringProperty;
  'valueCentimetersPatternStringProperty': LocalizedStringProperty;
  'valueSquareCentimetersPatternStringProperty': LocalizedStringProperty;
};

const BsshsTemplateStrings = getStringModule( 'BSSHS_TEMPLATE' ) as StringsType;

bsshsTemplate.register( 'BsshsTemplateStrings', BsshsTemplateStrings );

export default BsshsTemplateStrings;
