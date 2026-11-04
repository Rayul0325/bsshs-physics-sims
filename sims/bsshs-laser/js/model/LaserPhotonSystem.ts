// Copyright 2026, bsshs-physics-sims contributors
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Individual atoms and photons inside the cavity, for visual intuition. They are an illustration driven by
 * the rate equations in LaserModel: the number of excited atoms follows the model's N₂, the coherent beam
 * exists only while the model is lasing, and its size follows the model's stimulated-emission rate. No
 * measured quantity is read from here, so the class drawer values stay exactly reproducible.
 *
 * What it shows:
 *   - spontaneous emission: an excited atom decays by itself and sends a photon in a random direction with a
 *     random phase (energy E₂ − E₁);
 *   - a spontaneous photon that happens to travel along the cavity axis bounces between the mirrors and seeds
 *     the beam;
 *   - stimulated emission: an axial photon passing an excited atom makes it emit a twin with the SAME energy,
 *     direction and phase (the twin is a copy of the passing photon); only while the gain reaches threshold;
 *   - absorption: below threshold an axial photon passing an atom in E₁ is absorbed;
 *   - the output mirror lets part of the beam out toward the light meter, the back mirror reflects all of it.
 *
 * Coordinates: x along the cavity, 0 = back mirror, 1 = output mirror (the meter sits beyond 1);
 * y across the gain medium, 0..1. One unit of y is 1/ASPECT of one unit of x on screen.
 * The random numbers come from a seeded generator, so a run is deterministic.
 */

import bsshsLaser from '../bsshsLaser.js';

export type PhotonKind = 'spontaneous' | 'stimulated';

export type Photon = {
  id: number;
  x: number;
  y: number;
  direction: number; // angle on screen in radians (0 = toward the output mirror, π = toward the back mirror)
  phase: number; // phase offset in radians; drawn as sin( k·x − phase ) for axial photons
  energy: number; // eV
  axial: boolean; // travels along the cavity axis (bounces between the mirrors)
  coherent: boolean; // part of the lasing beam
  outside: boolean; // has left through the output mirror
  kind: PhotonKind;
  age: number; // s of screen time
};

export type Atom = {
  x: number;
  y: number;
  row: number;
  excited: boolean;
  pumpFlash: number; // s left of the "just pumped through E₃" highlight
  emitFlash: number; // s left of the "just emitted" highlight
};

export type PhotonSnapshot = { energy: number; direction: number; phase: number };
export type StimulatedEvent = { parent: PhotonSnapshot; child: PhotonSnapshot };

const COLUMNS = 16;
const ROWS = 4;
const SPEED = 0.42; // cavity lengths per second of screen time
const ASPECT = 4.6; // on-screen length / height of the gain medium
const METER_X = 1.3; // the light meter absorbs output photons here
const MAX_SPONTANEOUS_PER_SECOND = 22; // the drawing shows at most this many spontaneous emissions per second
const SPONTANEOUS_LIFETIME = 1.4; // s, how long an off-axis photon stays on screen
const AXIAL_CONE = 0.2; // rad, spontaneous photons this close to the axis become axial
const STIMULATED_PROBABILITY = 0.7; // per excited atom passed, while the beam is below its drawing size
const ABSORB_PROBABILITY = 0.35; // per E₁ atom passed in the photon's row, below threshold
const OUTPUT_LEAK_BOOST = 6; // the drawing lets 6 × (1 − R) of the beam out per hit, so output is visible
const INTERNAL_LOSS = 0.06; // per back-mirror hit while lasing (keeps the beam turning over at R = 100 %)
const MAX_PHOTONS = 140;
const LOG_LIMIT = 500;
const DIRECTION_LIMIT = 200;
const FLASH_TIME = 0.35;
const SEED = 20261104;

export default class LaserPhotonSystem {

  public static readonly COLUMNS = COLUMNS;
  public static readonly ROWS = ROWS;
  public static readonly ASPECT = ASPECT;
  public static readonly METER_X = METER_X;

  public readonly atoms: Atom[] = [];
  public photons: Photon[] = [];

  // Bookkeeping that tests and the view can read.
  public stimulatedLog: StimulatedEvent[] = [];
  public spontaneousCount = 0;
  public spontaneousDirections: number[] = [];
  public absorbedCount = 0;
  public meterCount = 0;
  public meterFlash = 0;

  private nextId = 1;
  private randomState = SEED;
  private spontaneousDebt = 0;

  public constructor() {
    for ( let r = 0; r < ROWS; r++ ) {
      for ( let c = 0; c < COLUMNS; c++ ) {
        this.atoms.push( { x: ( c + 0.5 ) / COLUMNS, y: ( r + 0.5 ) / ROWS, row: r, excited: false, pumpFlash: 0, emitFlash: 0 } );
      }
    }
    this.reset();
  }

  public reset(): void {
    this.randomState = SEED;
    this.photons = [];
    this.atoms.forEach( a => { a.excited = false; a.pumpFlash = 0; a.emitFlash = 0; } );
    this.nextId = 1;
    this.spontaneousDebt = 0;
    this.meterFlash = 0;
    this.meterCount = 0;
    this.absorbedCount = 0;
    this.clearLog();
  }

  public clearLog(): void {
    this.stimulatedLog = [];
    this.spontaneousCount = 0;
    this.spontaneousDirections = [];
  }

  /** Deterministic uniform random number in [0, 1) (mulberry32). */
  private random(): number {
    this.randomState = ( this.randomState + 0x6D2B79F5 ) | 0;
    let t = this.randomState;
    t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
    t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
  }

  private pick<T>( list: T[] ): T {
    return list[ Math.min( list.length - 1, Math.floor( this.random() * list.length ) ) ];
  }

  public get excitedCount(): number {
    return this.atoms.reduce( ( n, a ) => n + ( a.excited ? 1 : 0 ), 0 );
  }

  public get beamCount(): number {
    return this.photons.reduce( ( n, p ) => n + ( p.axial && !p.outside ? 1 : 0 ), 0 );
  }

  /**
   * @param dt - seconds of screen time
   * @param dtModel - seconds of model time
   * @param state - the rate-equation results this picture follows
   */
  public step( dt: number, dtModel: number, state: {
    upperFractionProperty: { value: number };
    upperLevelLifetimeProperty: { value: number };
    mirrorReflectivityProperty: { value: number };
    photonEnergyProperty: { value: number };
    stimulatedRateProperty: { value: number };
    isLasingProperty: { value: boolean };
  } ): void {
    const lasing = state.isLasingProperty.value;
    const energy = state.photonEnergyProperty.value;
    const tau = state.upperLevelLifetimeProperty.value * 1e-3;
    const reflectivity = state.mirrorReflectivityProperty.value / 100;
    const target = Math.round( state.upperFractionProperty.value * this.atoms.length );
    const stimulated = state.stimulatedRateProperty.value;
    const beamTarget = lasing ? Math.round( 4 + 32 * stimulated / ( stimulated + 4e18 ) ) : 0;

    this.atoms.forEach( a => {
      a.pumpFlash = Math.max( 0, a.pumpFlash - dt );
      a.emitFlash = Math.max( 0, a.emitFlash - dt );
    } );
    this.meterFlash = Math.max( 0, this.meterFlash - dt );

    // Spontaneous emission at the model rate (N₂/τ, scaled to the sample), capped for the drawing.
    let excited = this.atoms.filter( a => a.excited );
    this.spontaneousDebt += Math.min( excited.length * dtModel / tau, MAX_SPONTANEOUS_PER_SECOND * dt );
    while ( this.spontaneousDebt >= 1 && excited.length ) {
      this.spontaneousDebt -= 1;
      const atom = this.pick( excited );
      this.emitSpontaneous( atom, energy );
      excited = excited.filter( a => a !== atom );
    }
    if ( !excited.length ) { this.spontaneousDebt = Math.min( this.spontaneousDebt, 1 ); }

    // Lasing stopped: the beam is no longer coherent output, it just dies out.
    if ( !lasing ) { this.photons.forEach( p => { p.coherent = false; } ); }

    // Move photons; axial ones interact with the atoms they pass and with the mirrors.
    const survivors: Photon[] = [];
    const born: Photon[] = [];
    let beam = this.beamCount;
    for ( const p of this.photons ) {
      p.age += dt;
      const x0 = p.x;
      p.x += Math.cos( p.direction ) * SPEED * dt;
      p.y += Math.sin( p.direction ) * SPEED * ASPECT * dt;
      if ( !p.axial ) {
        if ( p.age < SPONTANEOUS_LIFETIME && p.x > -0.1 && p.x < 1.2 && p.y > -0.35 && p.y < 1.3 ) { survivors.push( p ); }
        continue;
      }
      if ( p.outside ) {
        if ( p.x < METER_X ) { survivors.push( p ); }
        else { this.meterCount++; this.meterFlash = FLASH_TIME; }
        continue;
      }
      let alive = true;
      const lo = Math.min( x0, p.x );
      const hi = Math.max( x0, p.x );
      for ( let c = 0; c < COLUMNS && alive; c++ ) {
        const cx = ( c + 0.5 ) / COLUMNS;
        if ( cx < lo || cx >= hi ) { continue; }
        const column = this.atoms.filter( a => Math.abs( a.x - cx ) < 1e-9 );
        if ( lasing ) {
          const partners = column.filter( a => a.excited && Math.abs( a.y - p.y ) > 1e-6 );
          if ( partners.length && beam + born.length < beamTarget && this.random() < STIMULATED_PROBABILITY ) {
            const atom = this.pick( partners );
            atom.excited = false;
            atom.emitFlash = FLASH_TIME;
            p.coherent = true;
            const twin = this.stimulatedTwin( p, atom );
            born.push( twin );
          }
        }
        else {
          const own = column.find( a => Math.abs( a.y - p.y ) < 1e-6 );
          if ( own && !own.excited && this.random() < ABSORB_PROBABILITY ) {
            own.excited = true;
            own.pumpFlash = FLASH_TIME;
            this.absorbedCount++;
            alive = false;
          }
        }
      }
      if ( !alive ) { beam--; continue; }
      if ( p.x >= 1 && Math.cos( p.direction ) > 0 ) {
        if ( this.random() < Math.min( 1, ( 1 - reflectivity ) * OUTPUT_LEAK_BOOST ) ) {
          p.outside = true;
          beam--;
        }
        else {
          p.x = 2 - p.x;
          p.direction = Math.PI;
        }
      }
      else if ( p.x <= 0 && Math.cos( p.direction ) < 0 ) {
        const excess = beam + born.length > beamTarget + 2;
        if ( ( lasing && this.random() < INTERNAL_LOSS ) || excess ) { beam--; continue; }
        p.x = -p.x;
        p.direction = 0;
      }
      survivors.push( p );
    }
    this.photons = survivors.concat( born );

    // Keep the excited-atom count on the model's N₂: the pump refills E₂ (through E₃), extra atoms decay.
    excited = this.atoms.filter( a => a.excited );
    let ground = this.atoms.filter( a => !a.excited );
    while ( excited.length < target && ground.length ) {
      const atom = this.pick( ground );
      atom.excited = true;
      atom.pumpFlash = FLASH_TIME;
      ground = ground.filter( a => a !== atom );
      excited.push( atom );
    }
    let extra = Math.min( excited.length - target, 4 );
    while ( extra-- > 0 ) {
      const atom = this.pick( excited );
      this.emitSpontaneous( atom, energy );
      excited = excited.filter( a => a !== atom );
    }

    if ( this.photons.length > MAX_PHOTONS ) {
      const offAxis = this.photons.filter( p => !p.axial );
      const drop = new Set( offAxis.slice( 0, this.photons.length - MAX_PHOTONS ) );
      this.photons = this.photons.filter( p => !drop.has( p ) );
    }
  }

  /** The atom decays by itself: random direction and phase; near the axis it becomes an axial seed. */
  private emitSpontaneous( atom: Atom, energy: number ): void {
    atom.excited = false;
    atom.emitFlash = FLASH_TIME;
    const direction = this.random() * 2 * Math.PI;
    const phase = this.random() * 2 * Math.PI;
    this.spontaneousCount++;
    if ( this.spontaneousDirections.length < DIRECTION_LIMIT ) { this.spontaneousDirections.push( direction ); }
    const toward = Math.cos( direction ) >= 0 ? 0 : Math.PI;
    const offAxis = Math.abs( Math.sin( direction ) );
    // One seed at a time: once a beam exists, the cavity mode is set by it (mode competition).
    const axial = offAxis < Math.sin( AXIAL_CONE ) && this.beamCount === 0;
    this.photons.push( {
      id: this.nextId++, x: atom.x, y: atom.y, direction: axial ? toward : direction, phase: phase, energy: energy,
      axial: axial, coherent: false, outside: false, kind: 'spontaneous', age: 0
    } );
  }

  /** Stimulated emission: the new photon is a copy of the passing one (same energy, direction and phase). */
  private stimulatedTwin( parent: Photon, atom: Atom ): Photon {
    const twin: Photon = {
      id: this.nextId++, x: parent.x, y: atom.y, direction: parent.direction, phase: parent.phase, energy: parent.energy,
      axial: true, coherent: true, outside: false, kind: 'stimulated', age: 0
    };
    if ( this.stimulatedLog.length < LOG_LIMIT ) {
      this.stimulatedLog.push( {
        parent: { energy: parent.energy, direction: parent.direction, phase: parent.phase },
        child: { energy: twin.energy, direction: twin.direction, phase: twin.phase }
      } );
    }
    return twin;
  }
}

bsshsLaser.register( 'LaserPhotonSystem', LaserPhotonSystem );
