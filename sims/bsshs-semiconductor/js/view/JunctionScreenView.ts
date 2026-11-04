// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the 「PN 접합」 screen: the junction and its circuit on top, the energy-band diagram or the I–V curve
 * below (one at a time), and on the side the controls (material, source voltage, doping, temperature, ideality
 * factor) and a readout table of the measured quantities.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import StringUnionProperty from '../../../axon/js/StringUnionProperty.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import HorizontalAquaRadioButtonGroup from '../../../sun/js/HorizontalAquaRadioButtonGroup.js';
import RectangularRadioButtonGroup from '../../../sun/js/buttons/RectangularRadioButtonGroup.js';
import Panel from '../../../sun/js/Panel.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsSemiconductor from '../bsshsSemiconductor.js';
import BsshsSemiconductorStrings from '../BsshsSemiconductorStrings.js';
import JunctionModel from '../model/JunctionModel.js';
import BandDiagramNode, { BAND_HEIGHT } from './BandDiagramNode.js';
import IVCurveNode from './IVCurveNode.js';
import JunctionCrystalNode from './JunctionCrystalNode.js';
import ResponsiveScreenView from './ResponsiveScreenView.js';
import { createNumberControl, createReadoutTable, formatNumber, LABEL_FONT, TITLE_FONT, valueWithUnit } from './ViewUtils.js';

const MARGIN = 16;
const DIAGRAM_WIDTH = 560;

type DiagramView = 'band' | 'curve';

export default class JunctionScreenView extends ResponsiveScreenView {

  private readonly crystalNode: JunctionCrystalNode;
  private readonly bandNode: BandDiagramNode;
  private readonly curveNode: IVCurveNode;
  private readonly viewSelector: Node;
  private readonly controlPanel: Panel;
  private readonly readoutPanel: Panel;
  private readonly resetAllButton: ResetAllButton;
  private readonly diagramViewProperty: StringUnionProperty<DiagramView>;

  public constructor( model: JunctionModel, tandem: Tandem ) {
    super( { tandem: tandem } );

    this.crystalNode = new JunctionCrystalNode( model );
    this.bandNode = new BandDiagramNode( model );
    this.curveNode = new IVCurveNode( model, DIAGRAM_WIDTH, BAND_HEIGHT );

    this.diagramViewProperty = new StringUnionProperty<DiagramView>( 'band', { validValues: [ 'band', 'curve' ], tandem: Tandem.OPT_OUT } );
    this.viewSelector = new RectangularRadioButtonGroup( this.diagramViewProperty, [
      { value: 'band', createNode: () => new Text( BsshsSemiconductorStrings.junction.bandViewStringProperty, { font: LABEL_FONT, maxWidth: 150 } ) },
      { value: 'curve', createNode: () => new Text( BsshsSemiconductorStrings.junction.curveViewStringProperty, { font: LABEL_FONT, maxWidth: 150 } ) }
    ], {
      orientation: 'horizontal',
      spacing: 8,
      radioButtonOptions: { xMargin: 12, yMargin: 8 },
      touchAreaXDilation: 4,
      touchAreaYDilation: 14,
      tandem: tandem.createTandem( 'viewSelector' )
    } );
    this.diagramViewProperty.link( v => {
      this.bandNode.visible = v === 'band';
      this.curveNode.visible = v === 'curve';
    } );

    // --- controls
    const materialRadio = new HorizontalAquaRadioButtonGroup( model.materialProperty, [
      { value: 'silicon', createNode: () => new Text( BsshsSemiconductorStrings.junction.siliconStringProperty, { font: LABEL_FONT, maxWidth: 120 } ) },
      { value: 'germanium', createNode: () => new Text( BsshsSemiconductorStrings.junction.germaniumStringProperty, { font: LABEL_FONT, maxWidth: 120 } ) }
    ], { spacing: 22, touchAreaYDilation: 18, tandem: tandem.createTandem( 'materialRadioButtonGroup' ) } );

    const dopingFormatter = ( exponent: number ) => StringUtils.fillIn(
      BsshsSemiconductorStrings.units.perCubicCentimetreStringProperty.value, { value: formatNumber( Math.pow( 10, exponent ) ) } );

    const sourceControl = createNumberControl( BsshsSemiconductorStrings.junction.sourceVoltageStringProperty, model.sourceVoltageProperty,
      JunctionModel.SOURCE_VOLTAGE_RANGE, { delta: 0.05, decimalPlaces: 2, valuePattern: BsshsSemiconductorStrings.units.voltsStringProperty, tandem: tandem.createTandem( 'sourceVoltageControl' ) } );
    const acceptorControl = createNumberControl( BsshsSemiconductorStrings.junction.acceptorDensityStringProperty, model.acceptorExponentProperty,
      JunctionModel.DOPING_EXPONENT_RANGE, { delta: 0.1, numberFormatter: dopingFormatter, tandem: tandem.createTandem( 'acceptorControl' ) } );
    const donorControl = createNumberControl( BsshsSemiconductorStrings.junction.donorDensityStringProperty, model.donorExponentProperty,
      JunctionModel.DOPING_EXPONENT_RANGE, { delta: 0.1, numberFormatter: dopingFormatter, tandem: tandem.createTandem( 'donorControl' ) } );
    const temperatureControl = createNumberControl( BsshsSemiconductorStrings.junction.temperatureStringProperty, model.temperatureProperty,
      JunctionModel.TEMPERATURE_RANGE, { delta: 1, decimalPlaces: 0, valuePattern: BsshsSemiconductorStrings.units.kelvinStringProperty, tandem: tandem.createTandem( 'temperatureControl' ) } );
    const idealityControl = createNumberControl( BsshsSemiconductorStrings.junction.idealityFactorStringProperty, model.idealityFactorProperty,
      JunctionModel.IDEALITY_FACTOR_RANGE, { delta: 0.05, decimalPlaces: 2, tandem: tandem.createTandem( 'idealityControl' ) } );

    this.controlPanel = new Panel( new VBox( {
      align: 'left',
      spacing: 9,
      children: [
        new Text( BsshsSemiconductorStrings.junction.materialStringProperty, { font: TITLE_FONT, maxWidth: 200 } ),
        materialRadio,
        sourceControl, acceptorControl, donorControl, temperatureControl, idealityControl
      ]
    } ), { xMargin: 12, yMargin: 10 } );

    // --- readouts
    const biasText = new DerivedProperty( [ model.diodeVoltageProperty, BsshsSemiconductorStrings.junction.forwardBiasStringProperty,
      BsshsSemiconductorStrings.junction.reverseBiasStringProperty, BsshsSemiconductorStrings.junction.noBiasStringProperty ], ( vd, fwd, rev, none ) =>
      vd > 1e-9 ? fwd : vd < -1e-9 ? rev : none );
    const mA = ( x: number ) => formatNumber( x * 1e3 );
    const um = ( x: number ) => formatNumber( x * 1e6 );
    const table = createReadoutTable( [
      { label: BsshsSemiconductorStrings.junction.biasStateStringProperty, value: biasText },
      { label: BsshsSemiconductorStrings.junction.diodeVoltageStringProperty, value: valueWithUnit( model.diodeVoltageProperty, BsshsSemiconductorStrings.units.voltsStringProperty, x => formatNumber( x, 3 ) ) },
      { label: BsshsSemiconductorStrings.junction.diodeCurrentStringProperty, value: valueWithUnit( model.diodeCurrentProperty, BsshsSemiconductorStrings.units.milliampsStringProperty, mA ) },
      { label: BsshsSemiconductorStrings.junction.depletionWidthStringProperty, value: valueWithUnit( model.depletionWidthProperty, BsshsSemiconductorStrings.units.micrometresStringProperty, um ) },
      { label: BsshsSemiconductorStrings.junction.builtInVoltageStringProperty, value: valueWithUnit( model.builtInVoltageProperty, BsshsSemiconductorStrings.units.voltsStringProperty ) },
      { label: BsshsSemiconductorStrings.junction.saturationCurrentStringProperty, value: valueWithUnit( model.saturationCurrentProperty, BsshsSemiconductorStrings.units.milliampsStringProperty, mA ) },
      { label: BsshsSemiconductorStrings.junction.intrinsicDensityStringProperty, value: valueWithUnit( model.intrinsicDensityProperty, BsshsSemiconductorStrings.units.perCubicCentimetreStringProperty ) }
    ] );
    this.readoutPanel = new Panel( table, { xMargin: 12, yMargin: 10 } );

    this.resetAllButton = new ResetAllButton( {
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
        this.diagramViewProperty.reset();
      },
      touchAreaDilation: 16,
      tandem: tandem.createTandem( 'resetAllButton' )
    } );

    this.children = [ this.crystalNode, this.viewSelector, this.bandNode, this.curveNode, this.controlPanel,
      this.readoutPanel, this.resetAllButton ];
    this.layoutLandscape();
    this.relayoutWhenResized( this.controlPanel, this.readoutPanel );
  }

  protected layoutLandscape(): void {
    const b = this.layoutBounds;
    this.crystalNode.setScaleMagnitude( 1 );
    this.crystalNode.left = b.minX + MARGIN;
    this.crystalNode.top = b.minY + 6;
    this.viewSelector.left = this.crystalNode.left + 40;
    this.viewSelector.top = this.crystalNode.bottom + 6;
    this.bandNode.left = this.crystalNode.left;
    this.bandNode.top = this.viewSelector.bottom + 4;
    this.curveNode.left = this.crystalNode.left;
    this.curveNode.top = this.bandNode.top;
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
    this.crystalNode.centerX = w / 2;
    this.crystalNode.top = 0;
    this.viewSelector.left = this.crystalNode.left + 40;
    this.viewSelector.top = this.crystalNode.bottom + 6;
    this.bandNode.left = this.crystalNode.left;
    this.bandNode.top = this.viewSelector.bottom + 4;
    this.curveNode.left = this.crystalNode.left;
    this.curveNode.top = this.bandNode.top;
    this.readoutPanel.setScaleMagnitude( 1.15 );
    this.readoutPanel.centerX = w / 2;
    this.readoutPanel.top = this.bandNode.top + BAND_HEIGHT + 8;
    this.controlPanel.setScaleMagnitude( 1.3 );
    this.controlPanel.centerX = w / 2;
    this.controlPanel.top = this.readoutPanel.bottom + 12;
    this.resetAllButton.setScaleMagnitude( 1.2 );
    this.resetAllButton.right = w - 6;
    this.resetAllButton.top = this.controlPanel.bottom + 12;
    return this.resetAllButton.bottom + 6;
  }

  public override step( dt: number ): void {
    this.crystalNode.step( dt );
    this.bandNode.step( dt );
  }
}

bsshsSemiconductor.register( 'JunctionScreenView', JunctionScreenView );
