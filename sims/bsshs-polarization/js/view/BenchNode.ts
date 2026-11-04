// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * The optical bench of the 「편광판」 screen: a lamp, three polarizer positions and a detector on one line. The beam's
 * opacity follows its intensity (W/m², relative to the strongest source), and the windows below each stretch of the
 * beam show the electric-field oscillation direction there.
 */

import Multilink from '../../../axon/js/Multilink.js';
import Circle from '../../../scenery/js/nodes/Circle.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import Color from '../../../scenery/js/util/Color.js';
import Tandem from '../../../tandem/js/Tandem.js';
import bsshsPolarization from '../bsshsPolarization.js';
import BsshsPolarizationStrings from '../BsshsPolarizationStrings.js';
import PolarizerModel from '../model/PolarizerModel.js';
import FieldIndicatorNode from './FieldIndicatorNode.js';
import PolarizationViewConstants from './PolarizationViewConstants.js';
import PolarizerDiscNode from './PolarizerDiscNode.js';

const C = PolarizationViewConstants;
const BEAM_Y = 66;
const BEAM_HEIGHT = 16;
const SOURCE_X = 44;
const POLARIZER_X = [ 196, 336, 476 ];
const DETECTOR_X = 600;
const INDICATOR_Y = 214;
const ZERO = 1e-9; // W/m²; below this the light counts as fully blocked

export default class BenchNode extends Node {

  public constructor( model: PolarizerModel, tandem: Tandem ) {
    super();

    const maxIntensity = PolarizerModel.SOURCE_INTENSITY_RANGE.max;

    // Lamp
    const lampBody = new Rectangle( -34, -40, 62, 80, 10, 10, { fill: Color.DARK_GRAY } );
    const lampLens = new Circle( 13, { x: 28, fill: C.BEAM_COLOR, stroke: Color.BLACK, lineWidth: 1 } );
    const lamp = new Node( { children: [ lampBody, lampLens ], x: SOURCE_X, y: BEAM_Y } );
    const lampLabel = new Text( BsshsPolarizationStrings.lightSourceStringProperty, { font: C.DRAWING_FONT, maxWidth: 90 } );
    lampLabel.centerX = SOURCE_X;
    lampLabel.top = BEAM_Y + 48;

    // Detector, its window glowing with the light that reaches it
    const detectorBody = new Rectangle( -22, -44, 56, 88, 8, 8, { fill: Color.DARK_GRAY } );
    const detectorWindow = new Rectangle( -22, -BEAM_HEIGHT, 8, 2 * BEAM_HEIGHT, { fill: C.BEAM_COLOR } );
    const detector = new Node( { children: [ detectorBody, detectorWindow ], x: DETECTOR_X, y: BEAM_Y } );
    const detectorLabel = new Text( BsshsPolarizationStrings.detectorStringProperty, { font: C.DRAWING_FONT, maxWidth: 90 } );
    detectorLabel.centerX = DETECTOR_X + 6;
    detectorLabel.top = BEAM_Y + 52;

    // Beam stretches: source → P1 → P2 → P3 → detector
    const xs = [ SOURCE_X + 41, ...POLARIZER_X, DETECTOR_X - 22 ];
    const beams = xs.slice( 0, -1 ).map( ( x, i ) =>
      new Rectangle( x, BEAM_Y - BEAM_HEIGHT / 2, xs[ i + 1 ] - x, BEAM_HEIGHT, { fill: C.BEAM_COLOR } ) );

    const labels = [
      BsshsPolarizationStrings.polarizer1StringProperty,
      BsshsPolarizationStrings.polarizer2StringProperty,
      BsshsPolarizationStrings.polarizer3StringProperty
    ];
    const discs = model.polarizers.map( ( p, i ) => {
      const disc = new PolarizerDiscNode( p, labels[ i ], tandem.createTandem( `polarizer${i + 1}Node` ) );
      disc.x = POLARIZER_X[ i ];
      disc.y = BEAM_Y;
      return disc;
    } );

    const indicators = xs.slice( 0, -1 ).map( ( x, i ) => {
      const indicator = new FieldIndicatorNode( maxIntensity );
      indicator.x = ( x + xs[ i + 1 ] ) / 2;
      indicator.y = INDICATOR_Y;
      return indicator;
    } );
    const indicatorLayer = new Node( { children: indicators } );
    model.fieldIndicatorsVisibleProperty.link( visible => { indicatorLayer.visible = visible; } );

    this.children = [ ...beams, lamp, lampLabel, detector, detectorLabel, ...discs, indicatorLayer ];

    const opacityOf = ( intensity: number ) => ( intensity < ZERO ? 0 : 0.12 + 0.88 * Math.min( 1, intensity / maxIntensity ) );
    Multilink.multilink( [ model.segmentsProperty ], segments => {
      segments.forEach( ( s, i ) => {
        beams[ i ].opacity = opacityOf( s.intensity );
        indicators[ i ].setBeam( s );
      } );
      detectorWindow.opacity = opacityOf( segments[ segments.length - 1 ].intensity );
    } );
  }
}

bsshsPolarization.register( 'BenchNode', BenchNode );
