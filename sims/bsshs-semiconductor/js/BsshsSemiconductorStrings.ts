// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Typed access to this sim's strings. Values come from bsshs-semiconductor-strings_en.json, which holds the
 * Korean text directly (chipper bundles that file as the fallback for every locale, including ko).
 * Keep StringsType in sync with the JSON by hand: one entry per key, "<key>StringProperty".
 */

import getStringModule from '../../chipper/js/browser/getStringModule.js';
import type LocalizedStringProperty from '../../chipper/js/browser/LocalizedStringProperty.js';
import bsshsSemiconductor from './bsshsSemiconductor.js';

type StringsType = {
  'bsshs-semiconductor': {
    'titleStringProperty': LocalizedStringProperty;
  };
  'screen': {
    'junctionStringProperty': LocalizedStringProperty;
    'rectifierStringProperty': LocalizedStringProperty;
  };
  'junction': {
    'materialStringProperty': LocalizedStringProperty;
    'siliconStringProperty': LocalizedStringProperty;
    'germaniumStringProperty': LocalizedStringProperty;
    'sourceVoltageStringProperty': LocalizedStringProperty;
    'acceptorDensityStringProperty': LocalizedStringProperty;
    'donorDensityStringProperty': LocalizedStringProperty;
    'temperatureStringProperty': LocalizedStringProperty;
    'idealityFactorStringProperty': LocalizedStringProperty;
    'bandViewStringProperty': LocalizedStringProperty;
    'curveViewStringProperty': LocalizedStringProperty;
    'pTypeStringProperty': LocalizedStringProperty;
    'nTypeStringProperty': LocalizedStringProperty;
    'depletionLayerStringProperty': LocalizedStringProperty;
    'resistorLabelStringProperty': LocalizedStringProperty;
    'electronLegendStringProperty': LocalizedStringProperty;
    'holeLegendStringProperty': LocalizedStringProperty;
    'donorLegendStringProperty': LocalizedStringProperty;
    'acceptorLegendStringProperty': LocalizedStringProperty;
    'conductionBandStringProperty': LocalizedStringProperty;
    'valenceBandStringProperty': LocalizedStringProperty;
    'fermiLevelStringProperty': LocalizedStringProperty;
    'electronEnergyStringProperty': LocalizedStringProperty;
    'barrierStringProperty': LocalizedStringProperty;
    'operatingPointStringProperty': LocalizedStringProperty;
    'loadLineStringProperty': LocalizedStringProperty;
    'forwardBiasStringProperty': LocalizedStringProperty;
    'reverseBiasStringProperty': LocalizedStringProperty;
    'noBiasStringProperty': LocalizedStringProperty;
    'biasStateStringProperty': LocalizedStringProperty;
    'diodeVoltageStringProperty': LocalizedStringProperty;
    'diodeCurrentStringProperty': LocalizedStringProperty;
    'depletionWidthStringProperty': LocalizedStringProperty;
    'builtInVoltageStringProperty': LocalizedStringProperty;
    'saturationCurrentStringProperty': LocalizedStringProperty;
    'intrinsicDensityStringProperty': LocalizedStringProperty;
    'offScaleLeftStringProperty': LocalizedStringProperty;
    'offScaleRightStringProperty': LocalizedStringProperty;
  };
  'rectifier': {
    'circuitStringProperty': LocalizedStringProperty;
    'halfWaveStringProperty': LocalizedStringProperty;
    'bridgeStringProperty': LocalizedStringProperty;
    'diodeModelStringProperty': LocalizedStringProperty;
    'idealStringProperty': LocalizedStringProperty;
    'constantDropStringProperty': LocalizedStringProperty;
    'piecewiseLinearStringProperty': LocalizedStringProperty;
    'amplitudeStringProperty': LocalizedStringProperty;
    'frequencyStringProperty': LocalizedStringProperty;
    'loadResistanceStringProperty': LocalizedStringProperty;
    'capacitorConnectedStringProperty': LocalizedStringProperty;
    'capacitanceStringProperty': LocalizedStringProperty;
    'sourceStringProperty': LocalizedStringProperty;
    'loadStringProperty': LocalizedStringProperty;
    'oscilloscopeStringProperty': LocalizedStringProperty;
    'probeInputStringProperty': LocalizedStringProperty;
    'probeOutputStringProperty': LocalizedStringProperty;
    'channelInputStringProperty': LocalizedStringProperty;
    'channelOutputStringProperty': LocalizedStringProperty;
    'timeDivisionStringProperty': LocalizedStringProperty;
    'voltageDivisionStringProperty': LocalizedStringProperty;
    'cursorStringProperty': LocalizedStringProperty;
    'cursorTimeStringProperty': LocalizedStringProperty;
    'inputStringProperty': LocalizedStringProperty;
    'outputStringProperty': LocalizedStringProperty;
    'diodeCurrentStringProperty': LocalizedStringProperty;
    'peakVoltageStringProperty': LocalizedStringProperty;
    'rippleVoltageStringProperty': LocalizedStringProperty;
    'averageVoltageStringProperty': LocalizedStringProperty;
    'rippleApproxHalfStringProperty': LocalizedStringProperty;
    'rippleApproxBridgeStringProperty': LocalizedStringProperty;
    'slowMotionStringProperty': LocalizedStringProperty;
    'bridgeGroundNoteStringProperty': LocalizedStringProperty;
  };
  'units': {
    'voltsStringProperty': LocalizedStringProperty;
    'milliampsStringProperty': LocalizedStringProperty;
    'micrometresStringProperty': LocalizedStringProperty;
    'kelvinStringProperty': LocalizedStringProperty;
    'hertzStringProperty': LocalizedStringProperty;
    'ohmsStringProperty': LocalizedStringProperty;
    'microfaradsStringProperty': LocalizedStringProperty;
    'millisecondsStringProperty': LocalizedStringProperty;
    'electronVoltsStringProperty': LocalizedStringProperty;
    'perCubicCentimetreStringProperty': LocalizedStringProperty;
    'oneMicrometreStringProperty': LocalizedStringProperty;
    'voltAxisStringProperty': LocalizedStringProperty;
    'currentAxisStringProperty': LocalizedStringProperty;
  };
};

const BsshsSemiconductorStrings = getStringModule( 'BSSHS_SEMICONDUCTOR' ) as StringsType;

bsshsSemiconductor.register( 'BsshsSemiconductorStrings', BsshsSemiconductorStrings );

export default BsshsSemiconductorStrings;
