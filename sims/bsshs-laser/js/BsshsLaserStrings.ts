// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Typed access to this sim's strings. Values come from bsshs-laser-strings_en.json, which holds the
 * Korean text directly (chipper bundles that file as the fallback for every locale, including ko).
 * Keep StringsType in sync with the JSON by hand: one entry per key, "<key>StringProperty".
 */

import getStringModule from '../../chipper/js/browser/getStringModule.js';
import type LocalizedStringProperty from '../../chipper/js/browser/LocalizedStringProperty.js';
import bsshsLaser from './bsshsLaser.js';

type StringsType = {
  'bsshs-laser': {
    'titleStringProperty': LocalizedStringProperty;
  };
  'screen': {
    'mainStringProperty': LocalizedStringProperty;
  };
  'controls': {
    'titleStringProperty': LocalizedStringProperty;
    'pumpRateStringProperty': LocalizedStringProperty;
    'lifetimeStringProperty': LocalizedStringProperty;
    'reflectivityStringProperty': LocalizedStringProperty;
    'upperEnergyStringProperty': LocalizedStringProperty;
  };
  'units': {
    'perSecondPatternStringProperty': LocalizedStringProperty;
    'millisecondsPatternStringProperty': LocalizedStringProperty;
    'percentPatternStringProperty': LocalizedStringProperty;
    'electronVoltsPatternStringProperty': LocalizedStringProperty;
    'nanometersPatternStringProperty': LocalizedStringProperty;
    'wattsPatternStringProperty': LocalizedStringProperty;
    'perMeterPatternStringProperty': LocalizedStringProperty;
  };
  'cavity': {
    'backMirrorStringProperty': LocalizedStringProperty;
    'outputMirrorStringProperty': LocalizedStringProperty;
    'pumpLampStringProperty': LocalizedStringProperty;
    'mediumStringProperty': LocalizedStringProperty;
    'meterStringProperty': LocalizedStringProperty;
    'spontaneousLegendStringProperty': LocalizedStringProperty;
    'stimulatedLegendStringProperty': LocalizedStringProperty;
    'groundLegendStringProperty': LocalizedStringProperty;
    'excitedLegendStringProperty': LocalizedStringProperty;
  };
  'levels': {
    'titleStringProperty': LocalizedStringProperty;
    'pumpLevelStringProperty': LocalizedStringProperty;
    'upperLevelStringProperty': LocalizedStringProperty;
    'lowerLevelStringProperty': LocalizedStringProperty;
    'pumpStringProperty': LocalizedStringProperty;
    'fastDecayStringProperty': LocalizedStringProperty;
    'laserLightStringProperty': LocalizedStringProperty;
    'populationPatternStringProperty': LocalizedStringProperty;
  };
  'gain': {
    'titleStringProperty': LocalizedStringProperty;
    'gainStringProperty': LocalizedStringProperty;
    'lossStringProperty': LocalizedStringProperty;
  };
  'readouts': {
    'titleStringProperty': LocalizedStringProperty;
    'outputStringProperty': LocalizedStringProperty;
    'wavelengthStringProperty': LocalizedStringProperty;
    'photonEnergyStringProperty': LocalizedStringProperty;
    'upperStringProperty': LocalizedStringProperty;
    'lowerStringProperty': LocalizedStringProperty;
    'differenceStringProperty': LocalizedStringProperty;
    'thresholdPumpStringProperty': LocalizedStringProperty;
    'unreachableStringProperty': LocalizedStringProperty;
  };
  'status': {
    'noInversionStringProperty': LocalizedStringProperty;
    'belowThresholdStringProperty': LocalizedStringProperty;
    'lasingStringProperty': LocalizedStringProperty;
    'lasingClosedStringProperty': LocalizedStringProperty;
    'neverLasingStringProperty': LocalizedStringProperty;
  };
  'time': {
    'scalePatternStringProperty': LocalizedStringProperty;
  };
};

const BsshsLaserStrings = getStringModule( 'BSSHS_LASER' ) as StringsType;

bsshsLaser.register( 'BsshsLaserStrings', BsshsLaserStrings );

export default BsshsLaserStrings;
