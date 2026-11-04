// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the 「정류 회로」 screen: the schematic and the oscilloscope on one side; circuit and diode-model choice,
 * source amplitude and frequency, load resistance and the smoothing capacitor on the other, with the steady-state
 * readouts (output peak, ripple, average, and the linear-discharge ripple estimate for comparison).
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import TimeControlNode from '../../../scenery-phet/js/TimeControlNode.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Checkbox from '../../../sun/js/Checkbox.js';
import HorizontalAquaRadioButtonGroup from '../../../sun/js/HorizontalAquaRadioButtonGroup.js';
import Panel from '../../../sun/js/Panel.js';
import VerticalAquaRadioButtonGroup from '../../../sun/js/VerticalAquaRadioButtonGroup.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import RectifierModel from '../model/RectifierModel.js';
import OscilloscopeNode from './OscilloscopeNode.js';
import RectifierCircuitNode from './RectifierCircuitNode.js';
import ResponsiveScreenView from './ResponsiveScreenView.js';
import { createNumberControl, createReadoutTable, formatNumber, LABEL_FONT, SMALL_FONT, TITLE_FONT, valueWithUnit } from './ViewUtils.js';

const MARGIN = 16;

export default class RectifierScreenView extends ResponsiveScreenView {

  private readonly model: RectifierModel;
  private readonly circuitNode: RectifierCircuitNode;
  private readonly scopeNode: OscilloscopeNode;
  private readonly timeControls: HBox;
  private readonly controlPanel: Panel;
  private readonly readoutPanel: Panel;
  private readonly resetAllButton: ResetAllButton;

  public constructor( model: RectifierModel, tandem: Tandem ) {
    super( { tandem: tandem } );
    this.model = model;

    this.circuitNode = new RectifierCircuitNode( model );
    this.scopeNode = new OscilloscopeNode( model, tandem.createTandem( 'oscilloscope' ) );

    const timeControlNode = new TimeControlNode( model.isPlayingProperty, {
      playPauseStepButtonOptions: {
        playPauseButtonOptions: { radius: 22, touchAreaDilation: 19 },
        stepForwardButtonOptions: { radius: 16, touchAreaDilation: 25, listener: () => model.stepOnce( 1 / 30 ) }
      },
      tandem: tandem.createTandem( 'timeControlNode' )
    } );
    this.timeControls = new HBox( {
      spacing: 12,
      children: [ timeControlNode, new Text( BsshsSemiconductorStrings.rectifier.slowMotionStringProperty, { font: SMALL_FONT, maxWidth: 260 } ) ]
    } );

    // --- controls
    const circuitRadio = new HorizontalAquaRadioButtonGroup( model.circuitProperty, [
      { value: 'halfWave', createNode: () => new Text( BsshsSemiconductorStrings.rectifier.halfWaveStringProperty, { font: LABEL_FONT, maxWidth: 120 } ) },
      { value: 'bridge', createNode: () => new Text( BsshsSemiconductorStrings.rectifier.bridgeStringProperty, { font: LABEL_FONT, maxWidth: 120 } ) }
    ], { spacing: 22, touchAreaYDilation: 18, tandem: tandem.createTandem( 'circuitRadioButtonGroup' ) } );
    const modelRadio = new VerticalAquaRadioButtonGroup( model.diodeModelProperty, [
      { value: 'ideal', createNode: () => new RichText( BsshsSemiconductorStrings.rectifier.idealStringProperty, { font: LABEL_FONT, maxWidth: 250 } ) },
      { value: 'constantDrop', createNode: () => new RichText( BsshsSemiconductorStrings.rectifier.constantDropStringProperty, { font: LABEL_FONT, maxWidth: 250 } ) },
      { value: 'piecewiseLinear', createNode: () => new RichText( BsshsSemiconductorStrings.rectifier.piecewiseLinearStringProperty, { font: LABEL_FONT, maxWidth: 250 } ) }
    ], { spacing: 14, touchAreaXDilation: 8, tandem: tandem.createTandem( 'diodeModelRadioButtonGroup' ) } );

    const amplitudeControl = createNumberControl( BsshsSemiconductorStrings.rectifier.amplitudeStringProperty, model.inputAmplitudeProperty,
      RectifierModel.AMPLITUDE_RANGE, { delta: 0.1, decimalPlaces: 1, valuePattern: BsshsSemiconductorStrings.units.voltsStringProperty, tandem: tandem.createTandem( 'amplitudeControl' ) } );
    const frequencyControl = createNumberControl( BsshsSemiconductorStrings.rectifier.frequencyStringProperty, model.signalFrequencyProperty,
      RectifierModel.FREQUENCY_RANGE, { delta: 1, decimalPlaces: 0, valuePattern: BsshsSemiconductorStrings.units.hertzStringProperty, tandem: tandem.createTandem( 'frequencyControl' ) } );
    const resistanceControl = createNumberControl( BsshsSemiconductorStrings.rectifier.loadResistanceStringProperty, model.loadResistanceProperty,
      RectifierModel.RESISTANCE_RANGE, { delta: 10, decimalPlaces: 0, valuePattern: BsshsSemiconductorStrings.units.ohmsStringProperty, tandem: tandem.createTandem( 'resistanceControl' ) } );
    const capacitorCheckbox = new Checkbox( model.capacitorConnectedProperty,
      new Text( BsshsSemiconductorStrings.rectifier.capacitorConnectedStringProperty, { font: LABEL_FONT, maxWidth: 220 } ), {
        boxWidth: 18, touchAreaXDilation: 8, touchAreaYDilation: 16, tandem: tandem.createTandem( 'capacitorCheckbox' )
      } );
    const capacitanceControl = createNumberControl( BsshsSemiconductorStrings.rectifier.capacitanceStringProperty, model.capacitanceProperty,
      RectifierModel.CAPACITANCE_RANGE, { delta: 10, decimalPlaces: 0, valuePattern: BsshsSemiconductorStrings.units.microfaradsStringProperty,
        enabledProperty: model.capacitorConnectedProperty, tandem: tandem.createTandem( 'capacitanceControl' ) } );

    this.controlPanel = new Panel( new VBox( {
      align: 'left',
      spacing: 8,
      children: [
        new Text( BsshsSemiconductorStrings.rectifier.circuitStringProperty, { font: TITLE_FONT, maxWidth: 200 } ),
        circuitRadio,
        new Text( BsshsSemiconductorStrings.rectifier.diodeModelStringProperty, { font: TITLE_FONT, maxWidth: 200 } ),
        modelRadio,
        amplitudeControl, frequencyControl, resistanceControl, capacitorCheckbox, capacitanceControl
      ]
    } ), { xMargin: 12, yMargin: 10 } );

    // --- readouts (steady state)
    const approx = new DerivedProperty( [ model.peakVoltageProperty, model.signalFrequencyProperty, model.loadResistanceProperty,
      model.capacitanceProperty, model.circuitProperty, BsshsSemiconductorStrings.units.voltsStringProperty ], ( vp, f, r, c, circuit, pattern ) =>
      StringUtils.fillIn( pattern, { value: formatNumber( vp / ( ( circuit === 'bridge' ? 2 : 1 ) * f * r * c * 1e-6 ) ) } ) );
    const approxLabel = new DerivedProperty( [ model.circuitProperty, BsshsSemiconductorStrings.rectifier.rippleApproxHalfStringProperty,
      BsshsSemiconductorStrings.rectifier.rippleApproxBridgeStringProperty ], ( circuit, half, bridge ) => circuit === 'bridge' ? bridge : half );
    this.readoutPanel = new Panel( createReadoutTable( [
      { label: BsshsSemiconductorStrings.rectifier.peakVoltageStringProperty, value: valueWithUnit( model.peakVoltageProperty, BsshsSemiconductorStrings.units.voltsStringProperty ) },
      { label: BsshsSemiconductorStrings.rectifier.rippleVoltageStringProperty, value: valueWithUnit( model.rippleVoltageProperty, BsshsSemiconductorStrings.units.voltsStringProperty ) },
      { label: BsshsSemiconductorStrings.rectifier.averageVoltageStringProperty, value: valueWithUnit( model.averageOutputVoltageProperty, BsshsSemiconductorStrings.units.voltsStringProperty ) },
      { label: approxLabel, value: approx, visibleProperty: model.capacitorConnectedProperty }
    ], 210, 120 ), { xMargin: 12, yMargin: 10 } );

    this.resetAllButton = new ResetAllButton( {
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
      },
      touchAreaDilation: 16,
      tandem: tandem.createTandem( 'resetAllButton' )
    } );

    this.children = [ this.circuitNode, this.scopeNode, this.timeControls, this.controlPanel, this.readoutPanel, this.resetAllButton ];
    this.layoutLandscape();
    this.relayoutWhenResized( this.controlPanel, this.readoutPanel, this.scopeNode );
  }

  protected layoutLandscape(): void {
    const b = this.layoutBounds;
    this.circuitNode.left = b.minX + MARGIN;
    this.circuitNode.top = b.minY + 8;
    this.scopeNode.left = b.minX + MARGIN + 20;
    this.scopeNode.top = this.circuitNode.bottom + 4;
    this.timeControls.left = this.scopeNode.left;
    this.timeControls.bottom = b.maxY - 8;
    this.controlPanel.setScaleMagnitude( 1 );
    this.controlPanel.right = b.maxX - 30;
    this.controlPanel.top = b.minY + 8;
    this.readoutPanel.setScaleMagnitude( 1 );
    this.readoutPanel.right = this.controlPanel.right;
    this.readoutPanel.top = this.controlPanel.bottom + 8;
    this.resetAllButton.setScaleMagnitude( 1 );
    this.resetAllButton.right = this.controlPanel.left - 14;
    this.resetAllButton.bottom = b.maxY - MARGIN;
  }

  protected layoutPortrait(): number {
    const w = ResponsiveScreenView.PORTRAIT_WIDTH;
    this.circuitNode.centerX = w / 2;
    this.circuitNode.top = 0;
    this.scopeNode.centerX = w / 2;
    this.scopeNode.top = this.circuitNode.bottom + 6;
    this.timeControls.left = this.scopeNode.left;
    this.timeControls.top = this.scopeNode.bottom + 8;
    this.readoutPanel.setScaleMagnitude( 1.15 );
    this.readoutPanel.centerX = w / 2;
    this.readoutPanel.top = this.timeControls.bottom + 10;
    this.controlPanel.setScaleMagnitude( 1.25 );
    this.controlPanel.centerX = w / 2;
    this.controlPanel.top = this.readoutPanel.bottom + 12;
    this.resetAllButton.setScaleMagnitude( 1.2 );
    this.resetAllButton.right = w - 6;
    this.resetAllButton.top = this.controlPanel.bottom + 12;
    return this.resetAllButton.bottom + 6;
  }

  public override step( dt: number ): void {
    this.circuitNode.step( this.model.isPlayingProperty.value ? dt : 0 );
    this.scopeNode.step();
  }
}

bsshsSemiconductor.register( 'RectifierScreenView', RectifierScreenView );
