// Class drawer adapter for bending-light (PhET 1.2). Reads the model only; see docs/drawer.md.
//
// Model facts (verified in the built sim and in js/*/model/*.ts):
//   - Intro (screens[1]) and More Tools (screens[3]) use IntroModel: topMediumProperty (the laser side,
//     n₁) and bottomMediumProperty (n₂); propagateRays() builds model.rays with rayType 'incident',
//     'reflected', 'transmitted' using exact Snell (θ₂ = asin(n₁/n₂ sin θ₁)) and Fresnel powers. The laser
//     always sits in the top half, so the normal is the y axis through the origin.
//   - Prisms (screens[2]) use PrismsModel: rays are traced through model.prisms; model.intersections[0]
//     holds the unit normal and the point where the laser first meets a prism surface.
//   - LightRay: tail/tip (m), indexOfRefraction, wavelength (m, in the medium), wavelengthInVacuum (nm),
//     powerFraction (0..1), getSpeed() = c/n (m/s).
// Angles are measured from the normal with atan2 (well conditioned at 0°). Powers are the ray power
// fractions in %, the same numbers the intensity meter shows.
const drawer = globalThis.bsshsDrawer;
const C = 299792458;
const DEG = 180 / Math.PI;

/** Angle in degrees between direction (dx, dy) and the line along unit normal (nx, ny). */
function angleToNormal( dx, dy, nx, ny ) {
  const along = Math.abs( dx * nx + dy * ny );
  const across = Math.abs( dx * ny - dy * nx );
  return Math.atan2( across, along ) * DEG;
}
const dirOf = r => [ r.tip.x - r.tail.x, r.tip.y - r.tail.y ];
const sinDeg = a => ( a === null ? null : Math.sin( a / DEG ) );

/** Values shared by every screen: laser vacuum wavelength (nm), and the refracted-side quantities. */
function mediumValues( ray ) {
  if ( !ray ) { return { refractiveIndex: null, lightSpeedInMedium: null, wavelengthInMedium: null }; }
  const speed = typeof ray.getSpeed === 'function' ? ray.getSpeed() : C / ray.indexOfRefraction;
  return { refractiveIndex: ray.indexOfRefraction, lightSpeedInMedium: speed / C, wavelengthInMedium: ray.wavelength * 1e9 };
}

function readIntro( m ) {
  const lambda = m.laser.getWavelength() * 1e9;
  const n1 = m.indexOfRefractionOfTopMediumProperty.value;
  const n2 = m.indexOfRefractionOfBottomMediumProperty.value;
  const base = { wavelength: lambda, refractiveIndex1: n1, refractiveIndex2: n2 };
  if ( !m.laser.onProperty.value ) { return base; }
  const byType = t => m.rays.find( r => r.rayType === t ) || null;
  const inc = byType( 'incident' );
  const refl = byType( 'reflected' );
  const tran = byType( 'transmitted' );
  const angle = r => ( r ? angleToNormal( ...dirOf( r ), 0, 1 ) : null );
  const t1 = angle( inc );
  const t2 = angle( tran );
  return {
    ...base,
    incidentAngle: t1,
    reflectionAngle: angle( refl ),
    refractionAngle: t2,
    sinIncidentAngle: sinDeg( t1 ),
    sinRefractionAngle: sinDeg( t2 ),
    reflectedPower: inc ? ( refl ? refl.powerFraction * 100 : 0 ) : null,
    transmittedPower: inc ? ( tran ? tran.powerFraction * 100 : 0 ) : null,
    ...mediumValues( tran )
  };
}

function readPrisms( m ) {
  const laser = m.laser;
  const white = String( laser.colorModeProperty.value ) === 'WHITE';
  const out = { wavelength: white ? null : laser.getWavelength() * 1e9 };
  if ( !laser.onProperty.value || white || m.manyRaysProperty.value !== 1 ) { return out; }
  const hit = m.intersections.length ? m.intersections[ 0 ] : null;
  if ( !hit ) { return out; }
  const p = hit.point;
  const n = hit.unitNormal;
  const near = v => Math.hypot( v.x - p.x, v.y - p.y ) < 1e-9;
  const rays = [ ...m.rays ];
  const inc = rays.find( r => near( r.tip ) ) || null;
  if ( !inc ) { return out; }
  const [ lx, ly ] = dirOf( inc );
  const leaving = rays.filter( r => near( r.tail ) );
  const forward = leaving.find( r => { const [ dx, dy ] = dirOf( r ); return dx * lx + dy * ly > 0; } ) || null;
  const back = leaving.find( r => r !== forward ) || null;
  const t1 = angleToNormal( lx, ly, n.x, n.y );
  const t2 = forward ? angleToNormal( ...dirOf( forward ), n.x, n.y ) : null;
  return {
    ...out,
    refractiveIndex1: inc.indexOfRefraction,
    refractiveIndex2: forward ? forward.indexOfRefraction : null,
    incidentAngle: t1,
    reflectionAngle: back ? angleToNormal( ...dirOf( back ), n.x, n.y ) : null,
    refractionAngle: t2,
    sinIncidentAngle: sinDeg( t1 ),
    sinRefractionAngle: sinDeg( t2 ),
    reflectedPower: back ? back.powerFraction / inc.powerFraction * 100 : null,
    transmittedPower: forward ? forward.powerFraction / inc.powerFraction * 100 : 0,
    ...mediumValues( forward )
  };
}

/** Sets a medium Property to a named PhET substance (air, water, glass, diamond) or a custom index. */
function setMedium( m, prop, which ) {
  const cur = prop.value;
  const Sub = cur.substance.constructor;
  const Med = cur.constructor;
  const sub = typeof which === 'number' ? new Sub( cur.substance.nameProperty, which, false, true ) : Sub[ String( which ).toUpperCase() ];
  if ( !sub ) { throw new Error( `bending-light: unknown substance ${which}` ); }
  prop.value = new Med( cur.shape, sub, m.mediumColorFactory.getColor( sub.indexOfRefractionForRedLight ) );
}

drawer.register( {
  simId: 'bending-light',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = drawer.helpers.model();
    if ( !m || !m.laser ) { return {}; }
    if ( m.topMediumProperty ) { return readIntro( m ); }
    if ( m.prisms ) { return readPrisms( m ); }
    return {};
  },
  /**
   * V3 only. params: { screen: 'intro'|'prisms'|'more-tools', top, bottom (substance name or index),
   * incidentAngle (°), prism: 'square' (prisms: placed to the right of the laser, entry face normal
   * along −x), environment, prismMedium }. Turns the laser on and pauses the clock.
   */
  apply( params ) {
    const sim = drawer.helpers.sim();
    const pick = { intro: s => s.model && s.model.topMediumProperty && !s.model.velocitySensor,
      prisms: s => s.model && s.model.prisms, 'more-tools': s => s.model && s.model.velocitySensor };
    const screen = sim.screens.find( pick[ params.screen || 'intro' ] );
    if ( !screen ) { throw new Error( 'bending-light: screen not found' ); }
    sim.selectedScreenProperty.value = screen;
    const m = screen.model;
    m.isPlayingProperty.value = false;
    const laser = m.laser;
    if ( m.prisms ) {
      if ( params.environment !== undefined ) { setMedium( m, m.environmentMediumProperty, params.environment ); }
      if ( params.prismMedium !== undefined ) { setMedium( m, m.prismMediumProperty, params.prismMedium ); }
      if ( params.prism ) {
        const proto = m.getPrismPrototypes().find( p => p.typeName === params.prism );
        if ( !proto ) { throw new Error( `bending-light: no prism ${params.prism}` ); }
        // Centre the square 4 µm to the right of the laser pivot (it is 6.5 µm wide), so the laser starts
        // outside it and meets the left face (normal along −x) 0.75 µm away, near the face centre for
        // tilts up to about 75°.
        const pivot = laser.pivotProperty.value;
        proto.translate( pivot.x + 4e-6 - proto.positionProperty.value.x, pivot.y - proto.positionProperty.value.y );
        m.addPrism( proto );
      }
      // Laser points along +x at angle 180°; tilting by θ keeps the entry face normal (−x) as reference.
      if ( 'incidentAngle' in params ) { laser.setAngle( Math.PI + params.incidentAngle / DEG ); }
      laser.onProperty.value = true;
      m.dirty = true;
      m.step( 0 );
    }
    else {
      if ( params.top !== undefined ) { setMedium( m, m.topMediumProperty, params.top ); }
      if ( params.bottom !== undefined ) { setMedium( m, m.bottomMediumProperty, params.bottom ); }
      // Intro laser angle is measured from +x; the incident angle from the vertical normal is angle − 90°.
      if ( 'incidentAngle' in params ) { laser.setAngle( Math.PI / 2 + params.incidentAngle / DEG ); }
      laser.onProperty.value = true;
    }
  }
} );
