// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Typed access to this sim's strings. Values come from bsshs-polarization-strings_en.json, which holds the
 * Korean text directly (chipper bundles that file as the fallback for every locale, including ko).
 * Keep StringsType in sync with the JSON by hand: one entry per key, "<key>StringProperty".
 */

import getStringModule from '../../chipper/js/browser/getStringModule.js';
import type LocalizedStringProperty from '../../chipper/js/browser/LocalizedStringProperty.js';
import bsshsPolarization from './bsshsPolarization.js';

type S = LocalizedStringProperty;

type StringsType = {
  'bsshs-polarization': {
    'titleStringProperty': S;
  };
  'screen': {
    'polarizersStringProperty': S;
    'reflectionStringProperty': S;
  };
  'lightSourceStringProperty': S;
  'unpolarizedLightStringProperty': S;
  'polarizedLightStringProperty': S;
  'sourceAngleStringProperty': S;
  'sourceIntensityStringProperty': S;
  'polarizersStringProperty': S;
  'polarizer1StringProperty': S;
  'polarizer2StringProperty': S;
  'polarizer3StringProperty': S;
  'detectorStringProperty': S;
  'removedStringProperty': S;
  'fieldIndicatorsStringProperty': S;
  'measurementsStringProperty': S;
  'detectorIntensityStringProperty': S;
  'lastIncidentStringProperty': S;
  'lastAngleStringProperty': S;
  'cosSquaredStringProperty': S;
  'intensityRatioStringProperty': S;
  'sourceFractionStringProperty': S;
  'intensityPatternStringProperty': S;
  'anglePatternStringProperty': S;
  'unpolarizedNoteStringProperty': S;
  'incidentAngleStringProperty': S;
  'refractiveIndex2StringProperty': S;
  'airStringProperty': S;
  'mediumStringProperty': S;
  'waterStringProperty': S;
  'glassStringProperty': S;
  'diamondStringProperty': S;
  'incidentLightStringProperty': S;
  'lightUnpolarizedStringProperty': S;
  'lightSStringProperty': S;
  'lightPStringProperty': S;
  'refractionAngleStringProperty': S;
  'reflectanceSStringProperty': S;
  'reflectancePStringProperty': S;
  'reflectanceStringProperty': S;
  'brewsterAngleStringProperty': S;
  'raysAngleStringProperty': S;
  'perpendicularStringProperty': S;
  'chartTitleStringProperty': S;
  'chartAxisStringProperty': S;
  'legendSStringProperty': S;
  'legendPStringProperty': S;
  'markerLegendStringProperty': S;
  'reflectedStringProperty': S;
  'refractedStringProperty': S;
  'normalStringProperty': S;
};

const BsshsPolarizationStrings = getStringModule( 'BSSHS_POLARIZATION' ) as StringsType;

bsshsPolarization.register( 'BsshsPolarizationStrings', BsshsPolarizationStrings );

export default BsshsPolarizationStrings;
