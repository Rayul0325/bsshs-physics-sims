// Class drawer adapter for geometric-optics (PhET 1.3). Reads the model only; see docs/drawer.md.
//
// Model facts (verified in the built sim and in js/common/model/*.ts):
//   - screens[1] = Lens (model.optic = model.lens), screens[2] = Mirror (model.optic = model.mirror);
//   - optic.focalLengthProperty: signed, converging (convex lens, concave mirror) positive, cm;
//   - opticalObject.objectDistanceProperty = optic.x − object.x (cm, positive for a real object);
//   - opticalImage.imageDistanceProperty = f·a/(a − f): positive = real image (right of a lens, left of a
//     mirror), negative = virtual image. At a = f PhET returns 10e6 instead of infinity;
//   - opticalImage.magnificationProperty = −b/a.
//   This is the same sign convention as the class (1/a + 1/b = 1/f, m = −b/a, real = positive,
//   converging f positive, concave mirror f positive). The one difference: PhET's own
//   radiusOfCurvatureProperty is "convex positive" for mirrors too, so the drawer reports the mirror R
//   with the class sign (concave positive, R = 2f). For the symmetric PhET lens, R₁ = R and R₂ = −R
//   (class lensmaker convention), so 1/f = (n − 1)(1/R₁ − 1/R₂) gives PhET's f = R/(2(n − 1)).
const drawer = globalThis.bsshsDrawer;

/** The selected screen's model if it is a lens/mirror screen, else null. */
function goModel() {
  const m = drawer.helpers.model();
  return m && m.optic && m.opticalObjectChoiceProperty ? m : null;
}

/** The scene that matches the object choice (arrow, light, or a framed object like the pencil). */
function sceneOf( m ) {
  const choice = String( m.opticalObjectChoiceProperty.value );
  if ( choice === 'ARROW' && m.arrowScene ) { return m.arrowScene; }
  if ( choice === 'LIGHT' && m.lightScene ) { return m.lightScene; }
  return m.framedScene;
}

/** Object 1 and its image in the given scene. */
function objectAndImage( scene ) {
  if ( scene.framedObject ) { return [ scene.framedObject, scene.framedImage1 ]; }
  if ( scene.arrowObject1 ) { return [ scene.arrowObject1, scene.arrowImage1 ]; }
  if ( scene.lightObject1 ) { return [ scene.lightObject1, scene.opticalImage1 ]; }
  return [ null, null ];
}

const isMirror = m => !!m.mirror;

drawer.register( {
  simId: 'geometric-optics',
  screenName: () => drawer.helpers.screenName(),
  read() {
    const m = goModel();
    if ( !m ) { return {}; }
    const optic = m.optic;
    const [ obj, image ] = objectAndImage( sceneOf( m ) );
    const a = obj ? obj.objectDistanceProperty.value : null;
    const b = image ? image.imageDistanceProperty.value : null;
    const f = optic.focalLengthProperty.value;
    const R = optic.radiusOfCurvatureProperty.value; // PhET sign: convex positive
    const mirror = isMirror( m );
    const inv = x => ( Number.isFinite( x ) && x !== 0 ? 1 / x : null );
    return {
      objectDistance: a,
      imageDistance: b,
      focalLength: f,
      magnification: image ? image.magnificationProperty.value : null,
      objectDistanceInverse: inv( a ),
      imageDistanceInverse: inv( b ),
      objectFocalDistance: a === null ? null : a - f,
      imageFocalDistance: b === null ? null : b - f,
      refractiveIndex: mirror ? null : optic.indexOfRefractionProperty.value,
      radiusOfCurvature1: mirror ? null : R,
      radiusOfCurvature2: mirror ? null : -R,
      radiusOfCurvature: mirror ? -R : null
    };
  },
  /**
   * V3 only. params: { screen: 'lens'|'mirror', surface: 'convex'|'concave'|'flat', radiusOfCurvature
   * (magnitude, cm), refractiveIndex (lens), objectDistance (cm) }. Uses the default "indirect" focal-length
   * model (R and n set f), the same controls the sim shows.
   */
  apply( params ) {
    const sim = drawer.helpers.sim();
    const screen = params.screen === 'mirror' ? sim.screens.find( s => s.model && s.model.mirror ) :
                   sim.screens.find( s => s.model && s.model.lens );
    if ( !screen ) { throw new Error( 'geometric-optics: screen not found' ); }
    sim.selectedScreenProperty.value = screen;
    const m = screen.model;
    const optic = m.optic;
    if ( params.surface ) { optic.opticSurfaceTypeProperty.value = params.surface; }
    const fm = optic.indirectFocalLengthModel;
    if ( 'radiusOfCurvature' in params ) { fm.radiusOfCurvatureMagnitudeProperty.value = params.radiusOfCurvature; }
    if ( 'refractiveIndex' in params ) { fm.indexOfRefractionProperty.value = params.refractiveIndex; }
    if ( 'objectDistance' in params ) {
      const [ obj ] = objectAndImage( sceneOf( m ) );
      const p = obj.positionProperty.value;
      obj.positionProperty.value = new p.constructor( optic.positionProperty.value.x - params.objectDistance, p.y );
    }
  }
} );
