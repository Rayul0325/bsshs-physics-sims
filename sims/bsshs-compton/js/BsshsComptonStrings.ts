// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Typed access to this sim's strings. Values come from bsshs-compton-strings_en.json, which holds the
 * Korean text directly (chipper bundles that file as the fallback for every locale, including ko).
 * Keep StringsType in sync with the JSON by hand: one entry per key, "<key>StringProperty". Always write
 * BsshsComptonStrings.<key>StringProperty in full: chipper bundles only strings it finds spelled that way.
 */

import getStringModule from '../../chipper/js/browser/getStringModule.js';
import type LocalizedStringProperty from '../../chipper/js/browser/LocalizedStringProperty.js';
import bsshsCompton from './bsshsCompton.js';

type StringsType = {
  'bsshs-compton': {
    'titleStringProperty': LocalizedStringProperty;
  };
  'screen': {
    'mainStringProperty': LocalizedStringProperty;
  };
  'controlsTitleStringProperty': LocalizedStringProperty;
  'wavelengthStringProperty': LocalizedStringProperty;
  'energyStringProperty': LocalizedStringProperty;
  'detectorAngleStringProperty': LocalizedStringProperty;
  'picometersPatternStringProperty': LocalizedStringProperty;
  'degreesPatternStringProperty': LocalizedStringProperty;
  'speedPatternStringProperty': LocalizedStringProperty;
  'readoutsTitleStringProperty': LocalizedStringProperty;
  'scatteredWavelengthStringProperty': LocalizedStringProperty;
  'wavelengthShiftStringProperty': LocalizedStringProperty;
  'comptonWavelengthStringProperty': LocalizedStringProperty;
  'incidentEnergyStringProperty': LocalizedStringProperty;
  'scatteredEnergyStringProperty': LocalizedStringProperty;
  'electronKineticEnergyStringProperty': LocalizedStringProperty;
  'energyAfterStringProperty': LocalizedStringProperty;
  'recoilAngleStringProperty': LocalizedStringProperty;
  'electronSpeedStringProperty': LocalizedStringProperty;
  'xRayTubeStringProperty': LocalizedStringProperty;
  'electronAtRestStringProperty': LocalizedStringProperty;
  'detectorStringProperty': LocalizedStringProperty;
  'recoilElectronStringProperty': LocalizedStringProperty;
  'thetaPatternStringProperty': LocalizedStringProperty;
  'phiPatternStringProperty': LocalizedStringProperty;
  'waveNoteStringProperty': LocalizedStringProperty;
  'momentumTitleStringProperty': LocalizedStringProperty;
  'momentumNoteStringProperty': LocalizedStringProperty;
  'energyTitleStringProperty': LocalizedStringProperty;
  'beforeStringProperty': LocalizedStringProperty;
  'afterStringProperty': LocalizedStringProperty;
  'scaleTitleStringProperty': LocalizedStringProperty;
  'scaleAxisStringProperty': LocalizedStringProperty;
};

const BsshsComptonStrings = getStringModule( 'BSSHS_COMPTON' ) as StringsType;

bsshsCompton.register( 'BsshsComptonStrings', BsshsComptonStrings );

export default BsshsComptonStrings;
