// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * View of the Compton scattering experiment: the scattering stage (tube, electron, draggable detector, recoil
 * electron), three measurement insets (momentum triangle, energy bars, the detector's wavelength scale), the input
 * panel and the readout panel.
 *
 * Two arrangements: landscape (the standard 1024 × 618 layout bounds, stage on the left, panels on the right) and
 * portrait for phones (a 520-wide column, stage on top), chosen in layout() from the available bounds so the
 * controls stay large enough to touch on a 390 px wide screen. In portrait the top-right corner is left empty,
 * where the class drawer's open button sits on phones.
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import Bounds2 from '../../../dot/js/Bounds2.js';
import ScreenView from '../../../joist/js/ScreenView.js';
import PlayPauseButton from '../../../scenery-phet/js/buttons/PlayPauseButton.js';
import ResetAllButton from '../../../scenery-phet/js/buttons/ResetAllButton.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import type Node from '../../../scenery/js/nodes/Node.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsCompton from '../bsshsCompton.js';
import BsshsComptonStrings from '../BsshsComptonStrings.js';
import type BsshsComptonModel from '../model/BsshsComptonModel.js';
import ComptonControlPanel from './ComptonControlPanel.js';
import ComptonViewConstants from './ComptonViewConstants.js';
import DetectorScaleNode from './DetectorScaleNode.js';
import EnergyBarsNode from './EnergyBarsNode.js';
import MomentumDiagramNode from './MomentumDiagramNode.js';
import ReadoutPanel from './ReadoutPanel.js';
import ScatteringStageNode from './ScatteringStageNode.js';

const C = ComptonViewConstants;
const MARGIN = 12;
const GAP = 10;
const PORTRAIT_WIDTH = 520;
const PORTRAIT_TOP_BAND = 84; // free top-right corner for the drawer button on phones

export default class BsshsComptonScreenView extends ScreenView {

  /** Public so automated checks can press it like a user. */
  public readonly resetAllButton: ResetAllButton;

  private readonly isPlayingProperty: BooleanProperty;
  private readonly stage: ScatteringStageNode;
  private readonly note: RichText;
  private readonly insets: HBox;
  private readonly controlPanel: Node;
  private readonly readoutPanel: Node;
  private readonly buttons: HBox;
  private readonly playPauseButton: PlayPauseButton;
  private portrait: boolean | null = null;
  private portraitHeight = 1000;

  public constructor( model: BsshsComptonModel, tandem: Tandem ) {
    super( { tandem: tandem } );

    // Starts paused: the opening picture is deterministic (the class drawer's layout check compares two loads
    // pixel by pixel), and the play button starts the wave animation.
    this.isPlayingProperty = new BooleanProperty( false, { tandem: tandem.createTandem( 'isPlayingProperty' ) } );

    this.stage = new ScatteringStageNode( model, this.isPlayingProperty );
    this.note = new RichText( BsshsComptonStrings.waveNoteStringProperty, { font: C.SMALL_FONT, lineWrap: 540 } );
    this.insets = new HBox( {
      spacing: GAP,
      align: 'top',
      children: [ new MomentumDiagramNode( model ), new EnergyBarsNode( model ), new DetectorScaleNode( model ) ]
    } );
    this.controlPanel = new ComptonControlPanel( model, tandem.createTandem( 'controlPanel' ) );
    this.readoutPanel = new ReadoutPanel( model );

    const playPauseButton = new PlayPauseButton( this.isPlayingProperty, {
      radius: 24,
      touchAreaDilation: 12,
      tandem: tandem.createTandem( 'playPauseButton' )
    } );
    this.resetAllButton = new ResetAllButton( {
      touchAreaDilation: 12,
      listener: () => {
        this.interruptSubtreeInput();
        model.reset();
        this.isPlayingProperty.reset();
        this.stage.reset();
      },
      tandem: tandem.createTandem( 'resetAllButton' )
    } );
    this.playPauseButton = playPauseButton;
    this.buttons = new HBox( { spacing: 20 } );

    this.children = [ this.stage, this.note, this.insets, this.controlPanel, this.readoutPanel, this.buttons ];
    this.arrange( false );
  }

  /** Places the parts for landscape (layoutBounds) or for the portrait column. */
  private arrange( portrait: boolean ): void {
    if ( portrait === this.portrait ) { return; }
    this.portrait = portrait;
    const stageWidth = ScatteringStageNode.WIDTH;

    if ( !portrait ) {
      const lb = this.layoutBounds;
      // play/pause sits in the stage's free top-left corner; Reset All beside the readouts
      this.buttons.children = [ this.resetAllButton ];
      this.stage.setScaleMagnitude( 1.04 );
      this.stage.left = MARGIN;
      this.stage.top = 12;
      if ( this.playPauseButton.parent !== this ) { this.addChild( this.playPauseButton ); }
      this.playPauseButton.left = MARGIN + 6;
      this.playPauseButton.top = MARGIN + 6;
      this.note.lineWrap = stageWidth - 20;
      this.note.left = MARGIN + 10;
      this.note.top = this.stage.bottom - 2;
      this.insets.setScaleMagnitude( Math.min( 1, ( stageWidth + 10 ) / this.insets.localBounds.width ) );
      this.insets.left = MARGIN;
      this.insets.bottom = lb.maxY - MARGIN;
      const columnLeft = MARGIN + stageWidth + 20;
      const columnRight = lb.maxX - 44; // keeps clear of the drawer button at the right edge
      const columnCenter = ( columnLeft + columnRight ) / 2;
      this.controlPanel.setScaleMagnitude( Math.min( 1, ( columnRight - columnLeft ) / this.controlPanel.localBounds.width ) );
      this.controlPanel.centerX = columnCenter;
      this.controlPanel.top = MARGIN;
      this.readoutPanel.setScaleMagnitude( Math.min( 1, ( columnRight - columnLeft - this.buttons.width - GAP ) / this.readoutPanel.localBounds.width ) );
      this.readoutPanel.left = this.controlPanel.left;
      this.readoutPanel.top = this.controlPanel.bottom + GAP;
      this.buttons.right = columnRight;
      this.buttons.bottom = this.readoutPanel.bottom;
    }
    else {
      const width = PORTRAIT_WIDTH - 2 * MARGIN;
      if ( this.playPauseButton.parent === this ) { this.removeChild( this.playPauseButton ); }
      this.buttons.children = [ this.playPauseButton, this.resetAllButton ];
      this.note.lineWrap = 330;
      this.note.left = MARGIN;
      this.note.top = MARGIN;
      this.stage.setScaleMagnitude( width / stageWidth );
      this.stage.left = MARGIN;
      this.stage.top = PORTRAIT_TOP_BAND;
      this.insets.setScaleMagnitude( Math.min( 1, width / this.insets.localBounds.width ) );
      this.insets.centerX = PORTRAIT_WIDTH / 2;
      this.insets.top = this.stage.bottom + GAP;
      this.controlPanel.setScaleMagnitude( Math.min( 1, width / this.controlPanel.localBounds.width ) );
      this.controlPanel.centerX = PORTRAIT_WIDTH / 2;
      this.controlPanel.top = this.insets.bottom + GAP;
      this.readoutPanel.setScaleMagnitude( Math.min( 1, ( width - this.buttons.width - GAP ) / this.readoutPanel.localBounds.width ) );
      this.readoutPanel.left = MARGIN;
      this.readoutPanel.top = this.controlPanel.bottom + GAP;
      this.buttons.right = PORTRAIT_WIDTH - MARGIN;
      this.buttons.bottom = this.readoutPanel.bottom;
      this.portraitHeight = this.readoutPanel.bottom + MARGIN;
    }
  }

  /**
   * Chooses the arrangement from the available bounds, then scales the matching reference bounds into them the
   * same way ScreenView's default layout does.
   */
  public override layout( viewBounds: Bounds2 ): void {
    const portrait = viewBounds.height > viewBounds.width * 1.15;
    this.arrange( portrait );
    const reference = portrait ? new Bounds2( 0, 0, PORTRAIT_WIDTH, this.portraitHeight ) : this.layoutBounds;
    this.matrix = ScreenView.getLayoutMatrix( reference, viewBounds );
    this.visibleBoundsProperty.value = this.parentToLocalBounds( viewBounds );
  }

  public override step( dt: number ): void {
    this.stage.step( dt );
  }
}

bsshsCompton.register( 'BsshsComptonScreenView', BsshsComptonScreenView );
