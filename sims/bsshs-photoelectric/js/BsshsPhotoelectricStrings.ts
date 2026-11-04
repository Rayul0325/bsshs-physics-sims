// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Typed access to this sim's strings. Values come from bsshs-photoelectric-strings_en.json, which holds the
 * Korean text directly (chipper bundles that file as the fallback for every locale, including ko).
 * Keep StringsType in sync with the JSON by hand: one entry per key, "<key>StringProperty".
 */

import getStringModule from '../../chipper/js/browser/getStringModule.js';
import type LocalizedStringProperty from '../../chipper/js/browser/LocalizedStringProperty.js';
import bsshsPhotoelectric from './bsshsPhotoelectric.js';

type StringsType = {
  'bsshs-photoelectric': {
    'titleStringProperty': LocalizedStringProperty;
  };
  'screen': {
    'mainStringProperty': LocalizedStringProperty;
  };
  'lightStringProperty': LocalizedStringProperty;
  'lightSourceStringProperty': LocalizedStringProperty;
  'turnLightOnStringProperty': LocalizedStringProperty;
  'turnLightOffStringProperty': LocalizedStringProperty;
  'wavelengthStringProperty': LocalizedStringProperty;
  'intensityStringProperty': LocalizedStringProperty;
  'frequencyStringProperty': LocalizedStringProperty;
  'photonEnergyStringProperty': LocalizedStringProperty;
  'ultravioletStringProperty': LocalizedStringProperty;
  'visibleLightStringProperty': LocalizedStringProperty;
  'infraredStringProperty': LocalizedStringProperty;
  'cathodeMetalStringProperty': LocalizedStringProperty;
  'metals': {
    'CsStringProperty': LocalizedStringProperty;
    'NaStringProperty': LocalizedStringProperty;
    'ZnStringProperty': LocalizedStringProperty;
    'CuStringProperty': LocalizedStringProperty;
    'PtStringProperty': LocalizedStringProperty;
  };
  'workFunctionStringProperty': LocalizedStringProperty;
  'thresholdFrequencyStringProperty': LocalizedStringProperty;
  'circuitStringProperty': LocalizedStringProperty;
  'voltageStringProperty': LocalizedStringProperty;
  'powerSupplyStringProperty': LocalizedStringProperty;
  'ammeterStringProperty': LocalizedStringProperty;
  'cathodePatternStringProperty': LocalizedStringProperty;
  'anodeStringProperty': LocalizedStringProperty;
  'showEnergyStringProperty': LocalizedStringProperty;
  'kineticEnergyMaxStringProperty': LocalizedStringProperty;
  'stoppingVoltageStringProperty': LocalizedStringProperty;
  'noPhotoelectronsStringProperty': LocalizedStringProperty;
  'graphTitleStringProperty': LocalizedStringProperty;
  'graphVoltageAxisStringProperty': LocalizedStringProperty;
  'graphCurrentAxisStringProperty': LocalizedStringProperty;
  'nanometersPatternStringProperty': LocalizedStringProperty;
  'electronVoltsPatternStringProperty': LocalizedStringProperty;
  'voltsPatternStringProperty': LocalizedStringProperty;
  'microAmperesPatternStringProperty': LocalizedStringProperty;
  'percentPatternStringProperty': LocalizedStringProperty;
  'frequencyPatternStringProperty': LocalizedStringProperty;
};

const BsshsPhotoelectricStrings = getStringModule( 'BSSHS_PHOTOELECTRIC' ) as StringsType;

bsshsPhotoelectric.register( 'BsshsPhotoelectricStrings', BsshsPhotoelectricStrings );

export default BsshsPhotoelectricStrings;
