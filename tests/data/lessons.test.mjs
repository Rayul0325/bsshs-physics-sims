// Contract tests for the class-record content (T5):
// data/lessons/<id>.json, data/units.json, docs/lessons.md.
// Run with `npm test` (node:test). Read-only inputs outside the repo
// (class archive, private names list) are optional; tests that need them
// skip with a clear message when they are absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { assertExamComplete } from '../../drawer/inject.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'data');
const LESSONS_DIR = join(DATA, 'lessons');
const DOCS_LESSONS = join(ROOT, 'docs', 'lessons.md');
const ARCHIVE = join(homedir(), 'services', 'class-archive', 'data', 'recordings');
const NAMES_FILE = join(homedir(), '.config', 'bsshs-physics-sims', 'private-names.txt');

// Driven by data/exam-scope.json, so a legitimate scope edit needs no edit here. Completeness of every
// listed id (adapter, cases, lessons) is enforced by drawer/inject.mjs assertExamComplete (spec 2.3).
const EXAM_IDS = JSON.parse(readFileSync(join(DATA, 'exam-scope.json'), 'utf8')).ids;
// The 54 catalogue sims outside exam scope (spec section 1 table).
const OTHER_IDS = [
  'atomic-interactions', 'balancing-act', 'balloons-and-static-electricity',
  'build-a-nucleus', 'build-an-atom', 'buoyancy', 'buoyancy-basics',
  'calculus-grapher', 'capacitor-lab-basics', 'charges-and-fields',
  'circuit-construction-kit-ac', 'circuit-construction-kit-ac-virtual-lab',
  'circuit-construction-kit-dc', 'circuit-construction-kit-dc-virtual-lab',
  'collision-lab', 'color-vision', 'coulombs-law', 'curve-fitting', 'density',
  'diffusion', 'energy-forms-and-changes', 'energy-skate-park',
  'energy-skate-park-basics', 'forces-and-motion-basics', 'fourier-making-waves',
  'friction', 'gas-properties', 'gases-intro', 'geometric-optics-basics',
  'gravity-and-orbits', 'gravity-force-lab', 'gravity-force-lab-basics',
  'hookes-law', 'john-travoltage', 'keplers-laws', 'magnet-and-compass',
  'magnets-and-electromagnets', 'masses-and-springs', 'masses-and-springs-basics',
  'molecules-and-light', 'my-solar-system', 'ohms-law', 'pendulum-lab',
  'plinko-probability', 'projectile-data-lab', 'projectile-motion',
  'resistance-in-a-wire', 'rutherford-scattering', 'states-of-matter',
  'states-of-matter-basics', 'under-pressure', 'vector-addition',
  'wave-on-a-string', 'waves-intro',
];
const ALL_IDS = [...EXAM_IDS, ...OTHER_IDS];

// CODATA 2018/2022 values (SI). Any lesson variable with one of these keys
// must carry exactly this constant.
const CODATA = {
  planckConstant: 6.62607015e-34,
  speedOfLight: 299792458,
  elementaryCharge: 1.602176634e-19,
  electronMass: 9.1093837139e-31,
  boltzmannConstant: 1.380649e-23,
  wienConstant: 2.897771955e-3,
  stefanBoltzmannConstant: 5.670374419e-8,
  rydbergEnergy: 2.179872361103e-18,
  bohrRadius: 5.29177210544e-11,
  vacuumPermeability: 1.25663706127e-6,
};

const FOLDER_RE = /\d{4}-\d{2}-\d{2}_[^\s"'/\\]+?_[0-9a-f]{8}/;
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const CAMEL_RE = /^[a-z][a-zA-Z0-9]*$/;
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const HANGUL_RE = /[가-힣]/;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const lessonPath = (id) => join(LESSONS_DIR, `${id}.json`);
const loadLesson = (id) => readJson(lessonPath(id));
const loadAllLessons = () => EXAM_IDS.map((id) => [id, loadLesson(id)]);
const loadUnits = () => readJson(join(DATA, 'units.json'));

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

function constOf(lesson, key) {
  for (const f of lesson.formulas) {
    for (const v of f.variables) {
      if (v.key === key && typeof v.constant === 'number') return v.constant;
    }
  }
  throw new Error(`${lesson.id}: constant ${key} not found`);
}

function formulaOf(lesson, key) {
  const f = lesson.formulas.find((x) => x.key === key);
  if (!f) throw new Error(`${lesson.id}: formula ${key} not found`);
  return f;
}

const close = (actual, expected, relTol, msg) => {
  const rel = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(rel <= relTol, `${msg}: got ${actual}, expected ${expected} (rel ${rel.toExponential(2)} > ${relTol})`);
};
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- scope

test('exam-scope.json ids are unique and each is complete (adapter.mjs, drawer.json, cases.json, lessons file)', () => {
  const scope = readJson(join(DATA, 'exam-scope.json'));
  assert.ok(scope.ids.length > 0);
  assert.equal(new Set(scope.ids).size, scope.ids.length);
  assertExamComplete(scope.ids);
});

// ---------------------------------------------------------------- schema

test('every exam-scope id has a lessons file matching the schema', () => {
  for (const id of EXAM_IDS) {
    assert.ok(existsSync(lessonPath(id)), `missing data/lessons/${id}.json`);
    const L = loadLesson(id);
    const where = `lessons/${id}`;
    assert.deepEqual(
      Object.keys(L).sort(),
      ['classUnits', 'formulas', 'id', 'sources', 'terms', 'title', 'unit'],
      `${where}: top-level keys`,
    );
    assert.equal(L.id, id, `${where}: id`);
    assert.ok(isNonEmptyString(L.title) && HANGUL_RE.test(L.title), `${where}: Korean title`);
    assert.ok(isNonEmptyString(L.unit), `${where}: unit`);

    assert.ok(Array.isArray(L.formulas) && L.formulas.length >= 2, `${where}: at least 2 formulas`);
    const fkeys = new Set();
    for (const f of L.formulas) {
      const fw = `${where} formula ${f.key}`;
      assert.match(f.key, SNAKE_RE, `${fw}: snake_case key`);
      assert.ok(!fkeys.has(f.key), `${fw}: duplicate key`);
      fkeys.add(f.key);
      for (const k of ['name', 'expr', 'tex']) assert.ok(isNonEmptyString(f[k]), `${fw}: ${k}`);
      assert.ok(HANGUL_RE.test(f.name), `${fw}: Korean name`);
      assert.equal(typeof f.emphasis, 'boolean', `${fw}: emphasis`);
      assert.equal(typeof f.outOfScope, 'boolean', `${fw}: outOfScope`);
      if ('note' in f) assert.ok(isNonEmptyString(f.note), `${fw}: note`);
      const allowed = new Set(['key', 'name', 'expr', 'tex', 'variables', 'emphasis', 'outOfScope', 'note']);
      for (const k of Object.keys(f)) assert.ok(allowed.has(k), `${fw}: unexpected field ${k}`);
      assert.ok(Array.isArray(f.variables) && f.variables.length >= 1, `${fw}: at least one variable`);
      const vkeys = new Set();
      for (const v of f.variables) {
        const vw = `${fw} var ${v.key}`;
        assert.match(v.key, CAMEL_RE, `${vw}: camelCase key`);
        assert.ok(!vkeys.has(v.key), `${vw}: duplicate variable`);
        vkeys.add(v.key);
        assert.ok(isNonEmptyString(v.symbol), `${vw}: symbol`);
        assert.ok(isNonEmptyString(v.name) && HANGUL_RE.test(v.name), `${vw}: Korean name`);
        assert.equal(typeof v.unit, 'string', `${vw}: unit`);
        if ('constant' in v) {
          assert.ok(typeof v.constant === 'number' && Number.isFinite(v.constant), `${vw}: numeric constant`);
        }
        for (const k of Object.keys(v)) {
          assert.ok(['key', 'symbol', 'name', 'unit', 'constant'].includes(k), `${vw}: unexpected field ${k}`);
        }
      }
      assert.ok(
        f.variables.some((v) => !('constant' in v)),
        `${fw}: needs at least one non-constant (measurable) variable`,
      );
    }

    assert.ok(Array.isArray(L.terms) && L.terms.length >= 3, `${where}: at least 3 terms`);
    const tnames = new Set();
    for (const t of L.terms) {
      const tw = `${where} term ${t.term}`;
      assert.ok(isNonEmptyString(t.term) && HANGUL_RE.test(t.term), `${tw}: Korean term`);
      assert.ok(!tnames.has(t.term), `${tw}: duplicate term`);
      tnames.add(t.term);
      assert.ok(isNonEmptyString(t.definition) && HANGUL_RE.test(t.definition), `${tw}: definition`);
      assert.equal(typeof t.emphasis, 'boolean', `${tw}: emphasis`);
      assert.equal(typeof t.outOfScope, 'boolean', `${tw}: outOfScope`);
      for (const k of Object.keys(t)) {
        assert.ok(['term', 'definition', 'emphasis', 'outOfScope'].includes(k), `${tw}: unexpected field ${k}`);
      }
    }

    assert.ok(Array.isArray(L.classUnits), `${where}: classUnits array`);
    const varKeys = new Set(L.formulas.flatMap((f) => f.variables.map((v) => v.key)));
    for (const c of L.classUnits) {
      const cw = `${where} classUnits ${c.quantity}`;
      assert.ok(varKeys.has(c.quantity), `${cw}: quantity must be a variable key in this file`);
      assert.ok(isNonEmptyString(c.phetUnit) && isNonEmptyString(c.classUnit), `${cw}: units`);
      assert.notEqual(c.phetUnit, c.classUnit, `${cw}: units must differ`);
      assert.ok(typeof c.factor === 'number' && Number.isFinite(c.factor) && c.factor > 0, `${cw}: factor`);
    }

    assert.ok(Array.isArray(L.sources) && L.sources.length > 0, `${where}: sources`);
    const items = new Set([...fkeys, ...tnames]);
    const covered = new Set();
    for (const s of L.sources) {
      assert.ok(items.has(s.item), `${where}: source item ${s.item} is not a formula key or term`);
      assert.ok(s.from === '표준' || FOLDER_RE.test(s.from), `${where}: source ${s.item} from ${s.from}`);
      assert.deepEqual(Object.keys(s).sort(), ['from', 'item'], `${where}: source fields`);
      covered.add(s.item);
    }
    for (const it of items) assert.ok(covered.has(it), `${where}: no source recorded for ${it}`);
  }
});

test('every formula has at least one variable', () => {
  for (const [id, L] of loadAllLessons()) {
    for (const f of L.formulas) assert.ok(f.variables.length >= 1, `${id}/${f.key}`);
  }
});

test('lesson emphasis/out-of-scope marks are used somewhere (class records were applied)', () => {
  const lessons = loadAllLessons().map(([, L]) => L);
  const all = lessons.flatMap((L) => [...L.formulas, ...L.terms]);
  assert.ok(all.some((x) => x.emphasis), 'no 수업 강조 item anywhere');
  assert.ok(all.some((x) => x.outOfScope), 'no 시험 범위 아님 item anywhere');
  for (const x of all) {
    assert.ok(!(x.emphasis && x.outOfScope), `${x.key ?? x.term}: cannot be both 강조 and 범위 아님`);
  }
  // Items the class said are out of scope must be marked as such.
  const compton = loadLesson('bsshs-compton');
  assert.ok(compton.formulas.some((f) => f.outOfScope), 'Compton: relativistic approximation must be 범위 아님');
});

test('same variable key means the same quantity: one unit and one constant value across files', () => {
  const unitByKey = new Map();
  const constByKey = new Map();
  for (const [id, L] of loadAllLessons()) {
    for (const f of L.formulas) {
      for (const v of f.variables) {
        const where = `${id}/${f.key}/${v.key}`;
        if (unitByKey.has(v.key)) {
          assert.equal(v.unit, unitByKey.get(v.key).unit, `${where}: unit differs from ${unitByKey.get(v.key).where}`);
        } else unitByKey.set(v.key, { unit: v.unit, where });
        if ('constant' in v) {
          if (constByKey.has(v.key)) assert.equal(v.constant, constByKey.get(v.key), `${where}: constant differs`);
          else constByKey.set(v.key, v.constant);
        }
        if (v.key in CODATA) {
          assert.equal(v.constant, CODATA[v.key], `${where}: CODATA value`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------- units

test('units.json covers all 68 ids exactly once with 기타 last', () => {
  const U = loadUnits();
  assert.ok(Array.isArray(U.units) && U.units.length >= 2);
  const seen = new Map();
  const unitIds = new Set();
  let prevOrder = -Infinity;
  for (const u of U.units) {
    assert.match(u.id, KEBAB_RE, `unit id ${u.id}`);
    assert.ok(!unitIds.has(u.id), `duplicate unit ${u.id}`);
    unitIds.add(u.id);
    assert.ok(isNonEmptyString(u.name) && HANGUL_RE.test(u.name), `unit ${u.id}: Korean name`);
    assert.ok(Number.isInteger(u.order) && u.order > prevOrder, `unit ${u.id}: increasing integer order`);
    prevOrder = u.order;
    assert.ok(Array.isArray(u.sims) && u.sims.length > 0, `unit ${u.id}: sims`);
    for (const s of u.sims) {
      assert.ok(!seen.has(s), `${s} in both ${seen.get(s)} and ${u.id}`);
      seen.set(s, u.id);
    }
  }
  assert.equal(ALL_IDS.length, 68);
  assert.deepEqual([...seen.keys()].sort(), [...ALL_IDS].sort());
  const last = U.units.at(-1);
  assert.equal(last.id, 'etc');
  assert.equal(last.name, '기타');
  for (const id of EXAM_IDS) assert.notEqual(seen.get(id), 'etc', `${id} is exam scope; it belongs to a class unit`);
});

test('every lessons unit exists in units.json and matches that unit\'s sims', () => {
  const U = loadUnits();
  const byId = new Map(U.units.map((u) => [u.id, u]));
  for (const [id, L] of loadAllLessons()) {
    assert.ok(byId.has(L.unit), `${id}: unit ${L.unit} missing from units.json`);
    assert.ok(byId.get(L.unit).sims.includes(id), `${id}: not listed under unit ${L.unit}`);
  }
});

// ---------------------------------------------------------------- privacy / provenance

test('no field other than sources contains a recording folder name', () => {
  for (const [id, L] of loadAllLessons()) {
    const { sources, ...rest } = L;
    const m = JSON.stringify(rest).match(FOLDER_RE);
    assert.equal(m, null, `${id}: folder name outside sources: ${m && m[0]}`);
  }
  for (const p of [join(DATA, 'units.json'), DOCS_LESSONS]) {
    const m = readFileSync(p, 'utf8').match(FOLDER_RE);
    assert.equal(m, null, `${p}: folder name: ${m && m[0]}`);
  }
});

test('sources point at real class-subject recordings', (t) => {
  if (!existsSync(ARCHIVE)) {
    t.skip(`class archive not found at ${ARCHIVE}; provenance check skipped`);
    return;
  }
  for (const [id, L] of loadAllLessons()) {
    for (const s of L.sources) {
      if (s.from === '표준') continue;
      const metaPath = join(ARCHIVE, s.from, 'meta.json');
      assert.ok(existsSync(metaPath), `${id}: source folder ${s.from} not in archive`);
      const m = readJson(metaPath);
      const subj = `${m.subject ?? ''}|${m.actual_subject ?? ''}`;
      assert.ok(/물리|전자기/.test(subj), `${id}: ${s.from} is not a 물리/전자기 subject lesson`);
    }
  }
});

test('privacy: no line of the private names file appears under data/ or docs/', (t) => {
  if (!existsSync(NAMES_FILE)) {
    t.skip(`private names file not found at ${NAMES_FILE}; privacy scan skipped`);
    return;
  }
  const names = readFileSync(NAMES_FILE, 'utf8')
    .split(/\r?\n/)
    .map((s, i) => [s.trim(), i + 1])
    .filter(([s]) => s.length > 0 && !s.startsWith('#'));
  assert.ok(names.length > 0, 'names file is empty');
  const files = [...walkFiles(DATA), ...walkFiles(join(ROOT, 'docs'))];
  const hits = [];
  for (const p of files) {
    const text = readFileSync(p, 'utf8').normalize('NFC');
    for (const [name, line] of names) {
      // Report only the line number of the names file, never the name itself.
      if (text.includes(name.normalize('NFC'))) hits.push(`${p.slice(ROOT.length + 1)} contains names-file line ${line}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('no long Korean double-quoted span is a verbatim copy from corrected.md', (t) => {
  const files = [...walkFiles(LESSONS_DIR), join(DATA, 'units.json'), DOCS_LESSONS];
  const spans = new Set();
  const QUOTE_RE = /["“]([^"“”]{16,}?)["”]/g;
  for (const p of files) {
    let text = readFileSync(p, 'utf8');
    // JSON strings are themselves delimited by ", so scan decoded string values.
    if (p.endsWith('.json')) {
      const vals = [];
      JSON.parse(text, (k, v) => { if (typeof v === 'string') vals.push(v); return v; });
      text = vals.join('\n');
    }
    for (const m of text.matchAll(QUOTE_RE)) if (HANGUL_RE.test(m[1])) spans.add(m[1].trim().normalize('NFC'));
  }
  if (spans.size === 0) return; // nothing quoted at all
  if (!existsSync(ARCHIVE)) {
    t.skip(`class archive not found; ${spans.size} quoted span(s) unchecked`);
    return;
  }
  const hits = [];
  for (const d of readdirSync(ARCHIVE)) {
    const p = join(ARCHIVE, d, 'corrected.md');
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8').normalize('NFC');
    for (const s of spans) if (text.includes(s)) hits.push(s.slice(0, 20));
  }
  assert.deepEqual(hits, [], 'direct quotes copied from class transcripts');
});

// ---------------------------------------------------------------- docs

test('docs/lessons.md has one section per unit, in Korean', () => {
  assert.ok(existsSync(DOCS_LESSONS), 'docs/lessons.md missing');
  const md = readFileSync(DOCS_LESSONS, 'utf8');
  assert.ok(HANGUL_RE.test(md));
  for (const u of loadUnits().units) assert.ok(md.includes(`## ${u.name}`), `docs/lessons.md: no section for ${u.name}`);
  assert.ok(md.includes('수업 강조') && md.includes('시험 범위 아님'), 'docs must explain the two marks');
  assert.ok(/녹음 인식 오류|음성 인식 오류/.test(md), 'docs must list ASR corrections');
});

// ---------------------------------------------------------------- physics sanity

test('physics: Compton shift at 90 degrees is one Compton wavelength (2.426 pm)', () => {
  const L = loadLesson('bsshs-compton');
  formulaOf(L, 'compton_shift');
  const h = constOf(L, 'planckConstant');
  const me = constOf(L, 'electronMass');
  const c = constOf(L, 'speedOfLight');
  const dl = (theta) => (h / (me * c)) * (1 - Math.cos(theta * DEG));
  close(dl(90), 2.42631e-12, 1e-4, 'Δλ(90°)');
  close(dl(180), 2 * 2.42631e-12, 1e-4, 'Δλ(180°)');
  assert.equal(dl(0), 0);
  // Recoil: electron kinetic energy = photon energy lost (71 pm, 90°).
  const lam = 71e-12;
  const lam2 = lam + dl(90);
  const Ke = h * c / lam - h * c / lam2;
  assert.ok(Ke > 0 && Ke < h * c / lam);
  close(Ke / 1.602176634e-16, 0.5770, 1e-3, 'K_e (keV) at 71 pm, 90°');
});

test('physics: Brewster angle for n1 = 1, n2 = 1.5 is 56.3 degrees and reflected ⟂ refracted', () => {
  const L = loadLesson('bsshs-polarization');
  formulaOf(L, 'brewster_angle');
  const thetaB = Math.atan(1.5 / 1) / DEG;
  close(thetaB, 56.31, 1e-3, 'θ_B');
  const thetaT = Math.asin(Math.sin(thetaB * DEG) / 1.5) / DEG;
  close(thetaB + thetaT, 90, 1e-9, 'θ_B + θ_t');
});

test('physics: Malus law and stacked polarizers', () => {
  const L = loadLesson('bsshs-polarization');
  formulaOf(L, 'malus_law');
  formulaOf(L, 'unpolarized_through_polarizer');
  const malus = (I0, th) => I0 * Math.cos(th * DEG) ** 2;
  close(malus(1, 60), 0.25, 1e-12, 'I/I0 at 60°');
  assert.ok(malus(1, 90) < 1e-30);
  // Unpolarized → 0°, 45°, 90°: I0/2 · cos²45 · cos²45 = I0/8.
  close(0.5 * malus(1, 45) * Math.cos(45 * DEG) ** 2, 0.125, 1e-12, 'three polarizers');
});

test('physics: photoelectric effect below threshold emits nothing, above it K_max = hf − W', () => {
  const L = loadLesson('bsshs-photoelectric');
  for (const k of ['photon_energy', 'photoelectric_equation', 'threshold_frequency', 'stopping_voltage']) formulaOf(L, k);
  const h = constOf(L, 'planckConstant');
  const e = constOf(L, 'elementaryCharge');
  const W = 2.28 * e; // sodium work function, J
  const kmax = (f) => h * f - W;
  const f0 = W / h;
  close(f0, 5.513e14, 1e-3, 'f0 (Na)');
  assert.ok(kmax(4.0e14) < 0, 'below threshold: no photoelectrons');
  assert.ok(kmax(f0 * 0.999) < 0);
  const k = kmax(1.0e15);
  close(k / e, 1.8557, 1e-3, 'K_max (eV) at 1e15 Hz');
  close(k / e, 1.8557, 1e-3, 'stopping voltage (V) = K_max / e');
  // Graph K_max(f): slope h, x-intercept f0, y-intercept −W.
  const slope = (kmax(2e15) - kmax(1e15)) / 1e15;
  close(slope, h, 1e-9, 'slope = h');
});

test('physics: Wien peak and Stefan–Boltzmann for a 5800 K blackbody', () => {
  const L = loadLesson('blackbody-spectrum');
  formulaOf(L, 'wien_displacement');
  formulaOf(L, 'planck_law');
  const b = constOf(L, 'wienConstant');
  close(b / 5800, 4.996e-7, 1e-3, 'λ_max at 5800 K');
  const sigma = constOf(L, 'stefanBoltzmannConstant');
  close(sigma * 5800 ** 4, 6.4164e7, 1e-3, 'σT⁴ at 5800 K');
  // Planck's law peak (numerical) agrees with Wien's constant.
  const h = constOf(L, 'planckConstant');
  const c = constOf(L, 'speedOfLight');
  const k = constOf(L, 'boltzmannConstant');
  const planck = (lam, T) => (2 * Math.PI * h * c * c) / lam ** 5 / (Math.exp((h * c) / (lam * k * T)) - 1);
  let best = 0;
  let bestLam = 0;
  for (let lam = 100e-9; lam < 3000e-9; lam += 0.1e-9) {
    const v = planck(lam, 5800);
    if (v > best) { best = v; bestLam = lam; }
  }
  close(bestLam, b / 5800, 1e-3, 'Planck peak vs Wien');
});

test('physics: hydrogen Balmer-alpha (3 → 2) is about 656 nm and E1 = −13.6 eV', () => {
  const L = loadLesson('models-of-the-hydrogen-atom');
  formulaOf(L, 'bohr_energy_level');
  formulaOf(L, 'transition_wavelength');
  const Ry = constOf(L, 'rydbergEnergy');
  const h = constOf(L, 'planckConstant');
  const c = constOf(L, 'speedOfLight');
  const E = (n) => -Ry / (n * n);
  close(E(1) / 1.602176634e-19, -13.606, 1e-4, 'E1 (eV)');
  close((h * c) / (E(3) - E(2)), 656.1e-9, 1e-3, 'λ(3→2)');
  close((h * c) / (E(2) - E(1)), 121.5e-9, 1e-3, 'λ(2→1) Lyman-alpha');
  const a0 = constOf(L, 'bohrRadius');
  close(4 * a0, 2.1167e-10, 1e-4, 'r2 = 4 a0');
});

test('physics: thin lens, magnification and mirror focal length', () => {
  const L = loadLesson('geometric-optics');
  for (const k of ['thin_lens_equation', 'magnification', 'lensmaker_equation']) formulaOf(L, k);
  const b = 1 / (1 / 10 - 1 / 15); // a = 15 cm, f = 10 cm
  close(b, 30, 1e-12, 'image distance');
  close(-b / 15, -2, 1e-12, 'magnification');
  // Lensmaker: symmetric biconvex, n = 1.5, R = 20 cm → f = 20 cm.
  close(1 / ((1.5 - 1) * (1 / 20 - 1 / -20)), 20, 1e-12, 'lensmaker f');
  // Object inside f gives a virtual (negative) image distance.
  assert.ok(1 / (1 / 10 - 1 / 5) < 0);
});

test('physics: Snell law, critical angle and speed in a medium', () => {
  const L = loadLesson('bending-light');
  for (const k of ['snell_law', 'critical_angle', 'speed_in_medium']) formulaOf(L, k);
  const c = constOf(L, 'speedOfLight');
  const t2 = Math.asin((1 * Math.sin(30 * DEG)) / 1.33) / DEG;
  close(t2, 22.08, 1e-3, 'refraction angle air→water at 30°');
  close(Math.asin(1 / 1.5) / DEG, 41.81, 1e-3, 'critical angle glass→air');
  close(c / 1.5, 1.9986e8, 1e-4, 'v in glass');
});

test('physics: double-slit fringe spacing and missing order', () => {
  const L = loadLesson('wave-interference');
  for (const k of ['fringe_spacing', 'double_slit_bright', 'single_slit_dark']) formulaOf(L, k);
  close((1 * 500e-9) / 0.1e-3, 5e-3, 1e-12, 'Δx = Lλ/d');
  // a = 2 mm, d = 3 mm → the 3rd interference order is missing (2/3 = m1/m2).
  const a = 2e-3;
  const d = 3e-3;
  const lam = 500e-9;
  const sinT = (3 * lam) / d;
  close((a * sinT) / lam, 2, 1e-12, 'missing order lands on single-slit 2nd minimum');
});

test('physics: induction — transformer, motional emf, generator peak emf', () => {
  const lab = loadLesson('faradays-electromagnetic-lab');
  formulaOf(lab, 'transformer_voltage_ratio');
  formulaOf(lab, 'ideal_transformer_power');
  close((200 / 100) * 10, 20, 1e-12, 'V2');
  close((10 * 1) / 20, 0.5, 1e-12, 'I2 from power balance');
  const law = loadLesson('faradays-law');
  formulaOf(law, 'faraday_law');
  formulaOf(law, 'magnetic_flux');
  close(0.5 * 0.2 * 3, 0.3, 1e-12, 'BLv');
  const gen = loadLesson('generator');
  formulaOf(gen, 'generator_emf');
  const omega = (600 * 2 * Math.PI) / 60; // 600 rpm
  const rpm = gen.classUnits.find((u) => u.quantity === 'angularSpeed');
  assert.ok(rpm, 'generator: rpm → rad/s conversion');
  close(600 * rpm.factor, omega, 1e-12, 'rpm factor');
  close(100 * 0.1 * 0.01 * omega, 6.2832, 1e-4, 'NBAω peak emf');
});

test('physics: diode models and rectifier ripple', () => {
  const L = loadLesson('bsshs-semiconductor');
  for (const k of ['constant_drop_model', 'piecewise_linear_model', 'half_wave_output', 'bridge_output', 'ripple_voltage']) {
    formulaOf(L, k);
  }
  // 5 V source, 20 Ω, constant drop 0.7 V → 0.215 A.
  close((5 - 0.7) / 20, 0.215, 1e-12, 'constant-drop current');
  // Piecewise linear with r_d = 1.5 Ω.
  const I = (5 - 0.7) / (20 + 1.5);
  close(0.7 + I * 1.5, 1.0, 1e-2, 'diode voltage, piecewise linear');
  // Bridge: two diode drops; ripple ≈ Vp/(2fRC).
  close(10 - 2 * 0.7, 8.6, 1e-12, 'bridge peak');
  close(8.6 / (2 * 60 * 1000 * 470e-6), 0.1525, 1e-3, 'bridge ripple');
  // Reverse bias (ideal) blocks: no negative output from a half-wave rectifier.
  const halfWave = (v) => Math.max(0, v - 0.7);
  assert.equal(halfWave(-5), 0);
});

test('physics: laser transition wavelength and population inversion', () => {
  const L = loadLesson('bsshs-laser');
  for (const k of ['transition_photon_energy', 'photon_wavelength', 'population_inversion']) formulaOf(L, k);
  const h = constOf(L, 'planckConstant');
  const c = constOf(L, 'speedOfLight');
  const e = CODATA.elementaryCharge; // eV → J (the laser lesson has no formula using e)
  close((h * c) / (1.96 * e), 632.6e-9, 1e-3, 'λ for 1.96 eV');
  // Thermal equilibrium never gives inversion: N2/N1 = exp(−ΔE/kT) < 1.
  const k = constOf(L, 'boltzmannConstant');
  assert.ok(Math.exp((-1.96 * e) / (k * 300)) < 1e-30);
});

test('physics: quantum measurement probabilities sum to one', () => {
  const L = loadLesson('quantum-measurement');
  formulaOf(L, 'born_rule');
  formulaOf(L, 'normalization');
  const a = Math.sqrt(1 / 2);
  close(a * a + a * a, 1, 1e-12, '|α|²+|β|²');
  close(Math.cos(60 * DEG) ** 2, 0.25, 1e-12, 'photon pass probability at 60°');
});
