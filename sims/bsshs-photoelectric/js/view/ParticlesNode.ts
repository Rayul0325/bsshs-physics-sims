// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Picture of the photons and photoelectrons inside the apparatus, drawn on one canvas. It follows the model but never
 * feeds back into it (the ammeter shows the model's steady-state photocurrent, not a count of these dots).
 *
 * - Photons leave the lamp at a rate proportional to the intensity and fly to the cathode as short wave packets in the
 *   light's color (gray for ultraviolet and infrared).
 * - When a photon lands and hf > W it frees one electron whose kinetic energy is drawn evenly from 0 to K_max (the
 *   same spread the model's I(V) assumes). Below the threshold nothing comes out, however many photons arrive.
 * - An electron aimed at the anode moves along the field: its kinetic energy changes by eV across the gap, so with a
 *   reverse voltage the slower ones stop and fall back to the cathode. The rest of the electrons head off at an angle
 *   and are lost on the glass, fewer of them as the forward voltage grows (BsshsPhotoelectricModel.aimedFraction).
 * The motion is slowed down enormously so the eye can follow it.
 */

import dotRandom from '../../../dot/js/dotRandom.js';
import CanvasNode from '../../../scenery/js/nodes/CanvasNode.js';
import bsshsPhotoelectric from '../bsshsPhotoelectric.js';
import PhotoelectricConstants from '../model/PhotoelectricConstants.js';
import BsshsPhotoelectricModel from '../model/BsshsPhotoelectricModel.js';
import ApparatusGeometry from './ApparatusGeometry.js';
import PhotoelectricViewConstants from './PhotoelectricViewConstants.js';

const G = ApparatusGeometry;
const PHOTONS_PER_SECOND_AT_FULL = 24; // drawn photons, not the real rate
const PHOTON_SPEED = 240; // view units per second
const PHOTON_LENGTH = 18;
const ELECTRON_RADIUS = 4;
const SPEED_SCALE = 0.9; // gap fractions per second for a 1 eV electron
const MAX_ELECTRONS = 400;
const MAX_ELECTRON_AGE = 6; // s, drops electrons that stall in the gap

type Photon = { x: number; y: number; dx: number; dy: number; distance: number; travelled: number; wavelength: number };
type Electron = {
  aimed: boolean;
  s: number; // aimed electrons: fraction of the cathode–anode gap
  v: number; // aimed electrons: gap fractions per second
  x: number; // drifting electrons: position and velocity in view units
  y: number;
  vx: number;
  vy: number;
  age: number;
};

export default class ParticlesNode extends CanvasNode {

  private readonly model: BsshsPhotoelectricModel;
  private photons: Photon[] = [];
  private electrons: Electron[] = [];
  private photonDebt = 0;

  public constructor( model: BsshsPhotoelectricModel ) {
    super( { canvasBounds: G.BOUNDS, pickable: false } );
    this.model = model;
  }

  public clear(): void {
    this.photons = [];
    this.electrons = [];
    this.photonDebt = 0;
    this.invalidatePaint();
  }

  public step( dt: number ): void {
    dt = Math.min( dt, 0.1 );
    const model = this.model;
    if ( this.photons.length === 0 && this.electrons.length === 0 && !model.lightOnProperty.value ) {
      return;
    }

    // New photons, at a rate proportional to the photon flux.
    const rate = model.photonRateProperty.value / PhotoelectricConstants.MAX_PHOTON_RATE * PHOTONS_PER_SECOND_AT_FULL;
    this.photonDebt += rate * dt;
    while ( this.photonDebt >= 1 ) {
      this.photonDebt -= 1;
      this.addPhoton();
    }

    // Move photons; a landing photon may free an electron.
    const landed: Photon[] = [];
    for ( const p of this.photons ) {
      p.travelled += PHOTON_SPEED * dt;
      if ( p.travelled >= p.distance ) {
        landed.push( p );
      }
    }
    if ( landed.length ) {
      this.photons = this.photons.filter( p => !landed.includes( p ) );
      for ( const p of landed ) {
        this.photonLanded( p.y + p.dy * p.distance );
      }
    }

    // Move electrons.
    const gap = G.ANODE.minX - G.CATHODE.maxX;
    const voltage = model.voltageProperty.value;
    const acceleration = SPEED_SCALE * SPEED_SCALE * voltage / 2; // from v² = α²(K + eV·s), K in eV
    const keep: Electron[] = [];
    for ( const e of this.electrons ) {
      e.age += dt;
      if ( e.aimed ) {
        e.v += acceleration * dt;
        e.s += e.v * dt;
        if ( e.s >= 1 || e.s < 0 || e.age > MAX_ELECTRON_AGE ) {
          continue; // reached the anode, fell back to the cathode, or stalled
        }
        e.x = G.CATHODE.maxX + e.s * gap;
      }
      else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if ( e.y < G.TUBE.minY + 8 || e.y > G.TUBE.maxY - 8 || e.x > G.ANODE.minX - 6 || e.age > MAX_ELECTRON_AGE ) {
          continue; // lost on the glass
        }
      }
      keep.push( e );
    }
    this.electrons = keep;
    this.invalidatePaint();
  }

  private addPhoton(): void {
    const g = G;
    const perp = g.LAMP_DIRECTION.perpendicular;
    const start = g.LAMP_FACE_CENTER.plus( perp.timesScalar( ( dotRandom.nextDouble() * 2 - 1 ) * g.LAMP_APERTURE ) );
    const t = dotRandom.nextDouble();
    const end = g.BEAM_TARGET_TOP.blend( g.BEAM_TARGET_BOTTOM, t );
    const delta = end.minus( start );
    const distance = delta.magnitude;
    this.photons.push( {
      x: start.x, y: start.y, dx: delta.x / distance, dy: delta.y / distance, distance: distance, travelled: 0,
      wavelength: this.model.wavelengthProperty.value
    } );
  }

  private photonLanded( y: number ): void {
    const model = this.model;
    const kMax = model.kineticEnergyMaxProperty.value;
    if ( kMax === null || this.electrons.length >= MAX_ELECTRONS ) {
      return; // below the threshold: no photoelectron
    }
    const energy = dotRandom.nextDouble() * kMax; // eV, spread evenly from 0 to K_max
    const speed = SPEED_SCALE * Math.sqrt( energy );
    const aimed = dotRandom.nextDouble() < BsshsPhotoelectricModel.aimedFraction( model.voltageProperty.value );
    const gap = G.ANODE.minX - G.CATHODE.maxX;
    const angle = ( 0.5 + 0.5 * dotRandom.nextDouble() ) * ( dotRandom.nextBoolean() ? 1 : -1 ); // 30°–60° off axis
    const viewSpeed = Math.max( speed, 0.15 ) * gap;
    this.electrons.push( {
      aimed: aimed,
      s: 0,
      v: speed,
      x: G.CATHODE.maxX + ELECTRON_RADIUS,
      y: y,
      vx: viewSpeed * Math.cos( angle ),
      vy: viewSpeed * Math.sin( angle ),
      age: 0
    } );
  }

  public override paintCanvas( context: CanvasRenderingContext2D ): void {
    // Photons: a short sine wave packet along the direction of travel.
    context.lineWidth = 2;
    for ( const p of this.photons ) {
      const cx = p.x + p.dx * p.travelled;
      const cy = p.y + p.dy * p.travelled;
      context.strokeStyle = PhotoelectricViewConstants.lightColor( p.wavelength ).toCSS();
      context.beginPath();
      for ( let i = 0; i <= 12; i++ ) {
        const u = ( i / 12 - 0.5 ) * PHOTON_LENGTH;
        const w = 3.5 * Math.sin( i / 12 * Math.PI * 4 );
        const x = cx + p.dx * u - p.dy * w;
        const y = cy + p.dy * u + p.dx * w;
        i === 0 ? context.moveTo( x, y ) : context.lineTo( x, y );
      }
      context.stroke();
    }

    // Electrons.
    context.fillStyle = PhotoelectricViewConstants.ELECTRON_COLOR.toCSS();
    for ( const e of this.electrons ) {
      context.beginPath();
      context.arc( e.x, e.y, ELECTRON_RADIUS, 0, Math.PI * 2 );
      context.fill();
    }
  }
}

bsshsPhotoelectric.register( 'ParticlesNode', ParticlesNode );
