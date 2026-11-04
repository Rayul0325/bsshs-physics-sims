// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The three control panels: light (wavelength with its frequency and photon energy, intensity), cathode metal (with
 * its work function and threshold frequency), and circuit (voltage, plus an optional readout of K_max and V₀).
 * Stock PhET components with their default, theme-supplied colors.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import PatternStringProperty from '../../../axon/js/PatternStringProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Dimension2 from '../../../dot/js/Dimension2.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import NumberControl, { NumberControlOptions } from '../../../scenery-phet/js/NumberControl.js';
import SpectrumSliderThumb from '../../../scenery-phet/js/SpectrumSliderThumb.js';
import SpectrumSliderTrack from '../../../scenery-phet/js/SpectrumSliderTrack.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import RectangularRadioButtonGroup from '../../../sun/js/buttons/RectangularRadioButtonGroup.js';
import Checkbox from '../../../sun/js/Checkbox.js';
import Panel from '../../../sun/js/Panel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import BsshsPhotoelectricStrings from '../BsshsPhotoelectricStrings.js';
import BsshsPhotoelectricModel from '../model/BsshsPhotoelectricModel.js';
import Metal from '../model/Metal.js';
import { metalName } from './metalNameProperty.js';
import PhotoelectricViewConstants from './PhotoelectricViewConstants.js';

const C = PhotoelectricViewConstants;
const TRACK_WIDTH = 230;
const CONTENT_WIDTH = C.PANEL_WIDTH - 24;

/** Options shared by the sliders: bigger touch areas for phones. */
function controlOptions( tandem: Tandem, extra: NumberControlOptions ): NumberControlOptions {
  return {
    titleNodeOptions: { font: C.LABEL_FONT, maxWidth: 200 },
    arrowButtonOptions: { touchAreaXDilation: 9, touchAreaYDilation: C.TOUCH_DILATION + 4 },
    layoutFunction: NumberControl.createLayoutFunction1( { align: 'left', titleXSpacing: 10, ySpacing: 8, arrowButtonsXSpacing: 10 } ),
    tandem: tandem,
    ...extra
  };
}

/** "label   value" on one line. */
function readoutRow( label: TReadOnlyProperty<string>, value: TReadOnlyProperty<string> ): Node {
  return new HBox( {
    spacing: 6,
    children: [
      new Text( label, { font: C.LABEL_FONT, maxWidth: 170 } ),
      new Text( value, { font: C.READOUT_FONT, maxWidth: 170 } )
    ]
  } );
}

/** Two readouts side by side, scaled down together if they would overflow the panel. */
function pair( a: Node, b: Node ): Node {
  return new HBox( { spacing: 18, children: [ a, b ], maxWidth: CONTENT_WIDTH } );
}

/** Frequency in units of 10¹⁴ Hz, two decimals. */
function frequencyString( frequencyProperty: TReadOnlyProperty<number> ): TReadOnlyProperty<string> {
  return new PatternStringProperty( BsshsPhotoelectricStrings.frequencyPatternStringProperty, { value: frequencyProperty }, {
    maps: { value: f => toFixed( f / 1e14, 2 ) }
  } );
}

function electronVoltString( property: TReadOnlyProperty<number> ): TReadOnlyProperty<string> {
  return new PatternStringProperty( BsshsPhotoelectricStrings.electronVoltsPatternStringProperty, { value: property }, { decimalPlaces: 2 } );
}

export class LightPanel extends Panel {
  public constructor( model: BsshsPhotoelectricModel, tandem: Tandem ) {
    const range = BsshsPhotoelectricModel.WAVELENGTH_RANGE;
    const valueToColor = ( wavelength: number ) => C.lightColor( wavelength );
    const track = new SpectrumSliderTrack( model.wavelengthProperty, range, {
      size: new Dimension2( TRACK_WIDTH, 22 ),
      valueToColor: valueToColor
    } );
    const thumb = new SpectrumSliderThumb( model.wavelengthProperty, {
      valueToColor: valueToColor,
      width: 26,
      height: 32,
      cursorHeight: 22
    } );
    thumb.touchArea = thumb.localBounds.dilatedXY( 20, 12 );

    const wavelengthControl = new NumberControl( BsshsPhotoelectricStrings.wavelengthStringProperty, model.wavelengthProperty, range,
      controlOptions( tandem.createTandem( 'wavelengthControl' ), {
        delta: 1,
        numberDisplayOptions: { decimalPlaces: 0, valuePattern: BsshsPhotoelectricStrings.nanometersPatternStringProperty, textOptions: { font: C.READOUT_FONT } },
        sliderOptions: { trackNode: track, thumbNode: thumb }
      } ) );

    const intensityControl = new NumberControl( BsshsPhotoelectricStrings.intensityStringProperty, model.intensityProperty,
      BsshsPhotoelectricModel.INTENSITY_RANGE, controlOptions( tandem.createTandem( 'intensityControl' ), {
        delta: 1,
        numberDisplayOptions: { decimalPlaces: 0, valuePattern: BsshsPhotoelectricStrings.percentPatternStringProperty, textOptions: { font: C.READOUT_FONT } },
        sliderOptions: {
          trackSize: new Dimension2( TRACK_WIDTH, 5 ),
          thumbTouchAreaXDilation: 20,
          thumbTouchAreaYDilation: 12
        }
      } ) );

    super( new VBox( {
      spacing: 10,
      align: 'left',
      children: [
        new Text( BsshsPhotoelectricStrings.lightStringProperty, { font: C.TITLE_FONT, maxWidth: CONTENT_WIDTH } ),
        wavelengthControl,
        pair(
          readoutRow( BsshsPhotoelectricStrings.frequencyStringProperty, frequencyString( model.frequencyProperty ) ),
          readoutRow( BsshsPhotoelectricStrings.photonEnergyStringProperty, electronVoltString( model.photonEnergyProperty ) )
        ),
        intensityControl
      ]
    } ), { minWidth: C.PANEL_WIDTH, xMargin: 12, yMargin: 10, align: 'left' } );
  }
}

export class MetalPanel extends Panel {
  public constructor( model: BsshsPhotoelectricModel, tandem: Tandem ) {
    const items = model.metals.map( ( metal: Metal ) => ( {
      value: metal,
      createNode: () => new VBox( {
        spacing: 2,
        children: [
          new Text( metalName( metal ), { font: C.LABEL_FONT, maxWidth: 52 } ),
          new Text( metal.symbol, { font: C.SMALL_FONT } )
        ]
      } ),
      tandemName: `${metal.symbol.toLowerCase()}RadioButton`
    } ) );
    const buttons = new RectangularRadioButtonGroup( model.metalProperty, items, {
      orientation: 'horizontal',
      spacing: 6,
      touchAreaXDilation: 3,
      touchAreaYDilation: C.TOUCH_DILATION,
      radioButtonOptions: { xMargin: 6, yMargin: 6 },
      tandem: tandem.createTandem( 'metalRadioButtonGroup' )
    } );

    super( new VBox( {
      spacing: 10,
      align: 'left',
      children: [
        new Text( BsshsPhotoelectricStrings.cathodeMetalStringProperty, { font: C.TITLE_FONT, maxWidth: CONTENT_WIDTH } ),
        buttons,
        pair(
          readoutRow( BsshsPhotoelectricStrings.workFunctionStringProperty, electronVoltString( model.workFunctionProperty ) ),
          readoutRow( BsshsPhotoelectricStrings.thresholdFrequencyStringProperty, frequencyString( model.thresholdFrequencyProperty ) )
        )
      ]
    } ), { minWidth: C.PANEL_WIDTH, xMargin: 12, yMargin: 10, align: 'left' } );
  }
}

export class CircuitPanel extends Panel {

  /** Whether K_max and V₀ are shown (a view setting; the drawer always records them). */
  public readonly showEnergyProperty: BooleanProperty;

  public constructor( model: BsshsPhotoelectricModel, tandem: Tandem ) {
    const showEnergyProperty = new BooleanProperty( false );
    const voltageControl = new NumberControl( BsshsPhotoelectricStrings.voltageStringProperty, model.voltageProperty,
      BsshsPhotoelectricModel.VOLTAGE_RANGE, controlOptions( tandem.createTandem( 'voltageControl' ), {
        delta: 0.01,
        numberDisplayOptions: { decimalPlaces: 2, valuePattern: BsshsPhotoelectricStrings.voltsPatternStringProperty, textOptions: { font: C.READOUT_FONT } },
        sliderOptions: {
          trackSize: new Dimension2( TRACK_WIDTH, 5 ),
          thumbTouchAreaXDilation: 20,
          thumbTouchAreaYDilation: 12,
          majorTicks: [ -10, 0, 10 ].map( v => ( { value: v, label: new Text( `${v}`, { font: C.SMALL_FONT } ) } ) ),
          majorTickLength: 12
        }
      } ) );

    const checkbox = new Checkbox( showEnergyProperty, new Text( BsshsPhotoelectricStrings.showEnergyStringProperty, {
      font: C.LABEL_FONT,
      maxWidth: CONTENT_WIDTH - 30
    } ), {
      boxWidth: 20,
      touchAreaXDilation: 6,
      touchAreaYDilation: C.TOUCH_DILATION,
      tandem: tandem.createTandem( 'showEnergyCheckbox' )
    } );

    const kString = new DerivedProperty( [ model.kineticEnergyMaxProperty, BsshsPhotoelectricStrings.electronVoltsPatternStringProperty ],
      ( k, pattern ) => k === null ? '' : pattern.replace( '{{value}}', toFixed( k, 2 ) ) );
    const vString = new DerivedProperty( [ model.stoppingVoltageProperty, BsshsPhotoelectricStrings.voltsPatternStringProperty ],
      ( v, pattern ) => v === null ? '' : pattern.replace( '{{value}}', toFixed( v, 2 ) ) );
    const energyRows = pair(
      readoutRow( BsshsPhotoelectricStrings.kineticEnergyMaxStringProperty, kString ),
      readoutRow( BsshsPhotoelectricStrings.stoppingVoltageStringProperty, vString )
    );
    energyRows.top = 0;
    const noElectrons = new Text( BsshsPhotoelectricStrings.noPhotoelectronsStringProperty, { font: C.LABEL_FONT, maxWidth: CONTENT_WIDTH, top: 0 } );

    // Same height whether or not the readout is shown, so the layout does not jump.
    const readout = new Node( { children: [ energyRows, noElectrons ] } );
    const updateReadout = () => {
      const emits = model.emitsElectronsProperty.value;
      energyRows.visible = showEnergyProperty.value && emits;
      noElectrons.visible = showEnergyProperty.value && !emits;
    };
    showEnergyProperty.link( updateReadout );
    model.emitsElectronsProperty.link( updateReadout );

    super( new VBox( {
      spacing: 10,
      align: 'left',
      children: [
        new Text( BsshsPhotoelectricStrings.circuitStringProperty, { font: C.TITLE_FONT, maxWidth: CONTENT_WIDTH } ),
        voltageControl,
        checkbox,
        readout
      ]
    } ), { minWidth: C.PANEL_WIDTH, xMargin: 12, yMargin: 10, align: 'left' } );

    this.showEnergyProperty = showEnergyProperty;
  }

  public reset(): void {
    this.showEnergyProperty.reset();
  }
}

bsshsPhotoelectric.register( 'ControlPanels', { LightPanel, MetalPanel, CircuitPanel } );
