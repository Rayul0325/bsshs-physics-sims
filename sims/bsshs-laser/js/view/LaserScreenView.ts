// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The laser screen: the cavity (top left), the energy-level diagram and the gain/loss meter (below it), the
 * controls and the measurements (right), and the clock and Reset All buttons. In a portrait window (phones)
 * the same panels are stacked in one column and scaled to the width, instead of shrinking the landscape
 * layout, so text stays readable and every control keeps a ≥ 44 px touch area.
 */

import DerivedProperty from '../../../axon/js/DerivedProperty.js';
import type { TReadOnlyProperty } from '../../../axon/js/TReadOnlyProperty.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import Dimension2 from '../../../dot/js/Dimension2.js';
import Matrix3 from '../../../dot/js/Matrix3.js';
import Range from '../../../dot/js/Range.js';
import { toFixed } from '../../../dot/js/util/toFixed.js';
import ScreenView from '../../../joist/js/ScreenView.js';
import NumberControl from '../../../scenery-phet/js/NumberControl.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import TimeControlNode from '../../../scenery-phet/js/TimeControlNode.js';
import TimeSpeed from '../../../scenery-phet/js/TimeSpeed.js';
import GridBox from '../../../scenery/js/layout/nodes/GridBox.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Panel from '../../../sun/js/Panel.js';
import StringUtils from '../../../phetcommon/js/util/StringUtils.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsLaser from '../bsshsLaser.js';
import BsshsLaserStrings from '../BsshsLaserStrings.js';
import LaserModel from '../model/LaserModel.js';
import CavityNode from './CavityNode.js';
import EnergyLevelNode from './EnergyLevelNode.js';
import GainMeterNode from './GainMeterNode.js';
import LaserViewConstants from './LaserViewConstants.js';

const MARGIN = 12;
const GAP = 10;
const LANDSCAPE_LEFT_WIDTH = 520; // panels in the left column
const LANDSCAPE_RIGHT_WIDTH = 466;
const LEVEL_PANEL_WIDTH = 344;
const PORTRAIT_SIDE = 8; // side margin of the stacked layout
const PORTRAIT_TOP = 58; // free band at the top (the class drawer's button sits in the top right corner)
const PORTRAIT_ASPECT = 0.9; // narrower than this (width / height) → stacked layout
const STEP_SECONDS = 0.1; // one press of the step button = 0.1 s of screen time

export default class LaserScreenView extends ScreenView {

  private readonly model: LaserModel;
  private readonly cavityNode: CavityNode;
  private readonly cavityPanel: Panel;
  private readonly levelPanel: Panel;
  private readonly gainPanel: Panel;
  private readonly controlPanel: Panel;
  private readonly readoutPanel: Panel;
  private readonly timeControlNode: TimeControlNode;
  private readonly resetAllButton: ResetAllButton;
  private readonly timeScaleText: Text;
  private portraitHeight = 0;

  public constructor( model: LaserModel, tandem: Tandem ) {
    super( { tandem: tandem } );
    this.model = model;

    this.cavityNode = new CavityNode( model );
    this.cavityPanel = new Panel( this.cavityNode, { xMargin: 10, yMargin: 8, minWidth: LANDSCAPE_LEFT_WIDTH } );

    // The level diagram and the gain meter sit side by side with the same height.
    const levelNode = new EnergyLevelNode( model );
    const gainNode = new GainMeterNode( model );
    const rowHeight = Math.max( levelNode.height, gainNode.height ) + 16;
    this.levelPanel = new Panel( levelNode, { xMargin: 10, yMargin: 8, minWidth: LEVEL_PANEL_WIDTH, minHeight: rowHeight, align: 'left' } );
    this.gainPanel = new Panel( gainNode, {
      xMargin: 10, yMargin: 8, minWidth: LANDSCAPE_LEFT_WIDTH - LEVEL_PANEL_WIDTH - GAP, minHeight: rowHeight, align: 'left'
    } );

    this.controlPanel = new Panel( this.createControls( model, tandem ), { xMargin: 10, yMargin: 8, minWidth: LANDSCAPE_RIGHT_WIDTH } );
    this.readoutPanel = new Panel( this.createReadouts( model ), { xMargin: 12, yMargin: 10, minWidth: LANDSCAPE_RIGHT_WIDTH, align: 'left' } );

    this.timeControlNode = new TimeControlNode( model.isPlayingProperty, {
      timeSpeedProperty: model.timeSpeedProperty,
      timeSpeeds: [ TimeSpeed.NORMAL, TimeSpeed.SLOW ],
      playPauseStepButtonOptions: {
        playPauseButtonOptions: { radius: 26, touchAreaDilation: 8 },
        stepForwardButtonOptions: {
          radius: 19,
          touchAreaDilation: 12,
          listener: () => model.stepModel( STEP_SECONDS )
        }
      },
      speedRadioButtonGroupOptions: {
        touchAreaXDilation: 10,
        spacing: 24,
        labelOptions: { font: LaserViewConstants.LABEL_FONT, maxWidth: 90 }
      },
      tandem: tandem.createTandem( 'timeControlNode' )
    } );
    const scaleProperty = new DerivedProperty( [ model.timeSpeedProperty, BsshsLaserStrings.time.scalePatternStringProperty ],
      ( speed, pattern ) => StringUtils.fillIn( pattern, {
        value: toFixed( ( speed === TimeSpeed.SLOW ? LaserModel.TIME_SCALE_SLOW : LaserModel.TIME_SCALE_NORMAL ) * 1e3, 1 )
      } ) );
    this.timeScaleText = new Text( scaleProperty, { font: LaserViewConstants.SMALL_FONT, maxWidth: 200 } );

    this.resetAllButton = new ResetAllButton( {
      radius: 26,
      touchAreaDilation: 8,
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
        this.step( 0 );
      },
      tandem: tandem.createTandem( 'resetAllButton' )
    } );

    this.children = [ this.cavityPanel, this.levelPanel, this.gainPanel, this.controlPanel, this.readoutPanel,
      this.timeControlNode, this.timeScaleText, this.resetAllButton ];

    this.layoutLandscape();
  }

  private createControls( model: LaserModel, tandem: Tandem ): Node {
    const control = ( label: TReadOnlyProperty<string>, property: LaserModel['pumpRateProperty'], range: Range,
                      delta: number, decimals: number, pattern: TReadOnlyProperty<string>, name: string ) =>
      new NumberControl( label, property, range, {
        delta: delta,
        titleNodeOptions: { font: LaserViewConstants.LABEL_FONT, maxWidth: 200 },
        numberDisplayOptions: {
          decimalPlaces: decimals,
          valuePattern: pattern,
          textOptions: { font: LaserViewConstants.LABEL_FONT },
          maxWidth: 110
        },
        sliderOptions: {
          trackSize: new Dimension2( 128, 4 ),
          thumbSize: new Dimension2( 16, 30 ),
          thumbTouchAreaXDilation: 22,
          thumbTouchAreaYDilation: 16,
          keyboardStep: delta,
          majorTicks: [],
          minorTickSpacing: 0
        },
        arrowButtonOptions: { scale: 0.85, touchAreaXDilation: 18, touchAreaYDilation: 20 },
        layoutFunction: NumberControl.createLayoutFunction4( { sliderPadding: 4, verticalSpacing: 6, arrowButtonSpacing: 8 } ),
        tandem: tandem.createTandem( name )
      } );
    const pump = control( BsshsLaserStrings.controls.pumpRateStringProperty, model.pumpRateProperty, LaserModel.PUMP_RATE_RANGE, 10, 0,
      BsshsLaserStrings.units.perSecondPatternStringProperty, 'pumpRateControl' );
    const lifetime = control( BsshsLaserStrings.controls.lifetimeStringProperty, model.upperLevelLifetimeProperty, LaserModel.LIFETIME_RANGE, 0.1, 1,
      BsshsLaserStrings.units.millisecondsPatternStringProperty, 'lifetimeControl' );
    const reflectivity = control( BsshsLaserStrings.controls.reflectivityStringProperty, model.mirrorReflectivityProperty, LaserModel.REFLECTIVITY_RANGE, 0.5, 1,
      BsshsLaserStrings.units.percentPatternStringProperty, 'reflectivityControl' );
    const energy = control( BsshsLaserStrings.controls.upperEnergyStringProperty, model.upperLevelEnergyProperty, LaserModel.UPPER_ENERGY_RANGE, 0.01, 2,
      BsshsLaserStrings.units.electronVoltsPatternStringProperty, 'upperEnergyControl' );
    return new GridBox( {
      xSpacing: 22,
      ySpacing: 14,
      xAlign: 'left',
      rows: [ [ pump, lifetime ], [ reflectivity, energy ] ]
    } );
  }

  private createReadouts( model: LaserModel ): Node {
    const font = LaserViewConstants.LABEL_FONT;
    const valueFont = LaserViewConstants.VALUE_FONT;
    const fmt = ( property: TReadOnlyProperty<number>, pattern: TReadOnlyProperty<string>, decimals: number ) =>
      new DerivedProperty( [ property, pattern, BsshsLaserStrings.readouts.unreachableStringProperty ], ( v, p, none ) =>
        ( Number.isFinite( v ) ? StringUtils.fillIn( p, { value: toFixed( v, decimals ) } ) : none ) );
    const cell = ( label: TReadOnlyProperty<string>, value: TReadOnlyProperty<string> ) => new HBox( {
      spacing: 8,
      children: [ new Text( label, { font: font, maxWidth: 120 } ), new Text( value, { font: valueFont, maxWidth: 110 } ) ]
    } );
    const grid = new GridBox( {
      xSpacing: 22,
      ySpacing: 8,
      xAlign: 'left',
      rows: [
        [ cell( BsshsLaserStrings.readouts.outputStringProperty, fmt( model.outputPowerProperty, BsshsLaserStrings.units.wattsPatternStringProperty, 3 ) ),
          cell( BsshsLaserStrings.readouts.wavelengthStringProperty, fmt( model.wavelengthProperty, BsshsLaserStrings.units.nanometersPatternStringProperty, 1 ) ) ],
        [ cell( BsshsLaserStrings.readouts.upperStringProperty, fmt( model.upperPopulationProperty, BsshsLaserStrings.units.percentPatternStringProperty, 1 ) ),
          cell( BsshsLaserStrings.readouts.photonEnergyStringProperty, fmt( model.photonEnergyProperty, BsshsLaserStrings.units.electronVoltsPatternStringProperty, 2 ) ) ],
        [ cell( BsshsLaserStrings.readouts.lowerStringProperty, fmt( model.lowerPopulationProperty, BsshsLaserStrings.units.percentPatternStringProperty, 1 ) ),
          cell( BsshsLaserStrings.readouts.thresholdPumpStringProperty, fmt( model.thresholdPumpRateProperty, BsshsLaserStrings.units.perSecondPatternStringProperty, 0 ) ) ],
        [ cell( BsshsLaserStrings.readouts.differenceStringProperty, fmt( model.populationDifferenceProperty, BsshsLaserStrings.units.percentPatternStringProperty, 1 ) ), null ]
      ]
    } );
    const statusProperty = new DerivedProperty( [ model.isLasingProperty, model.hasInversionProperty, model.thresholdPumpRateProperty,
        model.outputPowerProperty, BsshsLaserStrings.status.noInversionStringProperty, BsshsLaserStrings.status.belowThresholdStringProperty, BsshsLaserStrings.status.lasingStringProperty,
        BsshsLaserStrings.status.lasingClosedStringProperty, BsshsLaserStrings.status.neverLasingStringProperty ],
      ( lasing, inverted, threshold, power, noInv, below, on, closed, never ) => {
        if ( lasing ) { return power > 0 ? on : closed; }
        if ( !Number.isFinite( threshold ) && inverted ) { return never; }
        return inverted ? below : noInv;
      } );
    const statusFill = new DerivedProperty( [ model.isLasingProperty ], lasing => ( lasing ? LaserViewConstants.GAIN : LaserViewConstants.LOSS ) );
    const statusText = new Text( statusProperty, { font: valueFont, fill: statusFill, maxWidth: LANDSCAPE_RIGHT_WIDTH - 30 } );
    return new VBox( {
      spacing: 10,
      align: 'left',
      children: [ new Text( BsshsLaserStrings.readouts.titleStringProperty, { font: LaserViewConstants.TITLE_FONT, maxWidth: 200 } ), grid, statusText ]
    } );
  }

  /** Positions for the wide (1024 × 618) layout. */
  private layoutLandscape(): void {
    this.cavityPanel.left = MARGIN;
    this.cavityPanel.top = MARGIN;
    this.levelPanel.left = MARGIN;
    this.levelPanel.top = this.cavityPanel.bottom + GAP;
    this.gainPanel.left = this.levelPanel.right + GAP;
    this.gainPanel.top = this.levelPanel.top;
    const rightX = this.layoutBounds.maxX - MARGIN - LANDSCAPE_RIGHT_WIDTH;
    this.controlPanel.left = rightX;
    this.controlPanel.top = MARGIN;
    this.readoutPanel.left = rightX;
    this.readoutPanel.top = this.controlPanel.bottom + GAP;
    this.resetAllButton.right = this.layoutBounds.maxX - MARGIN - 8;
    this.resetAllButton.bottom = this.layoutBounds.maxY - MARGIN;
    this.timeControlNode.left = rightX + 4;
    this.timeControlNode.centerY = this.resetAllButton.centerY;
    this.timeScaleText.left = this.timeControlNode.right + 16;
    this.timeScaleText.centerY = this.resetAllButton.centerY;
  }

  /** Width of the stacked layout's frame: the widest panel plus side margins. */
  private portraitWidth(): number {
    const widest = Math.max( this.cavityPanel.width, this.levelPanel.width + GAP + this.gainPanel.width,
      this.controlPanel.width, this.readoutPanel.width );
    return widest + 2 * PORTRAIT_SIDE;
  }

  /** Positions for the stacked layout, in a portraitWidth()-wide frame; returns its height. */
  private layoutPortrait(): number {
    const width = this.portraitWidth();
    const left = ( width - this.cavityPanel.width ) / 2;
    this.cavityPanel.left = left;
    this.cavityPanel.top = PORTRAIT_TOP;
    this.levelPanel.left = left;
    this.levelPanel.top = this.cavityPanel.bottom + GAP;
    this.gainPanel.left = this.levelPanel.right + GAP;
    this.gainPanel.top = this.levelPanel.top;
    this.controlPanel.centerX = width / 2;
    this.controlPanel.top = this.levelPanel.bottom + GAP;
    this.readoutPanel.centerX = width / 2;
    this.readoutPanel.top = this.controlPanel.bottom + GAP;
    const rowTop = this.readoutPanel.bottom + GAP + 4;
    this.timeControlNode.left = left + 4;
    this.timeControlNode.top = rowTop;
    this.resetAllButton.right = width - left - 8;
    this.resetAllButton.centerY = this.timeControlNode.centerY;
    this.timeScaleText.left = this.timeControlNode.right + 14;
    this.timeScaleText.centerY = this.timeControlNode.centerY;
    return Math.max( this.timeControlNode.bottom, this.resetAllButton.bottom ) + MARGIN;
  }

  public override layout( viewBounds: Bounds2, layoutMatrixOptions?: Parameters<ScreenView[ 'layout' ]>[ 1 ] ): void {
    const portrait = viewBounds.width < viewBounds.height * PORTRAIT_ASPECT;
    if ( !portrait ) {
      this.layoutLandscape();
      super.layout( viewBounds, layoutMatrixOptions );
      return;
    }
    if ( !this.portraitHeight ) { this.portraitHeight = this.layoutPortrait(); }
    else { this.layoutPortrait(); }
    const height = this.portraitHeight;
    const width = this.portraitWidth();
    const scale = Math.min( viewBounds.width / width, viewBounds.height / height );
    const dx = ( viewBounds.width / scale - width ) / 2;
    const dy = ( viewBounds.height / scale - height ) / 2;
    this.matrix = Matrix3.rowMajor(
      scale, 0, viewBounds.left + dx * scale,
      0, scale, viewBounds.top + dy * scale,
      0, 0, 1
    );
    this.visibleBoundsProperty.value = this.parentToLocalBounds( viewBounds );
  }

  public override step( dt: number ): void {
    this.cavityNode.update( this.model );
  }
}

bsshsLaser.register( 'LaserScreenView', LaserScreenView );
