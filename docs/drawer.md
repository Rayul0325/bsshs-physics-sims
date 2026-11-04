# 수업 서랍 (시험 범위 14개 시뮬레이션)

빌드된 시뮬레이션 HTML에 **빌드 뒤에** 넣는 공통 서랍입니다. PhET 소스는 고치지 않습니다.
화면 가장자리 버튼을 누르면 옆에서 서랍이 나오고(휴대폰 폭에서는 아래에서 올라오는 시트), 탭은 「측정 기록」「그래프」「공식·용어」 세 개입니다.
서랍을 닫아 두면 실험 화면은 원래와 픽셀 단위로 같습니다(열기 버튼 자리만 다름, `tools/compare-layout.mjs`로 확인).

```sh
node tools/build-sim.mjs generator --brand bsshs --theme                 # 학교판 빌드
node tools/inject-drawer.mjs build/bsshs-theme/generator/generator_ko.html generator   # 서랍 넣기 (그 파일을 고쳐 씀)
node tools/compare-layout.mjs <서랍 넣은.html> <원래.html> --width 390 --exclude-button   # V9
node tools/check-sim.mjs <서랍 넣은.html>                                 # 기존 검사도 그대로 통과해야 함
```

## 시뮬레이션마다 만들 파일 (고정된 약속, 바꾸지 말 것)

`adapters/<id>/` 아래에 세 파일을 둡니다. 예시는 `adapters/_example/`(발전기, 연습용)입니다.

### `drawer.json` (해시에 들어감)

```json
{ "simId": "<id>", "schemaVersion": 1,
  "measurements": [ { "key": "wavelength", "name": "파장", "unit": "nm", "classUnit": { "unit": "m", "factor": 1e-9 } } ],
  "graphs": [ { "id": "energy-vs-frequency", "title": "진동수와 광자 에너지", "x": "frequency", "y": "photonEnergy", "fit": "linear" } ] }
```

- `simId` = 폴더 id. 다른 최상위 키는 받지 않습니다.
- `schemaVersion`: 측정 항목 정의의 버전(1 이상 정수). **배포 뒤에 항목의 뜻·단위·키를 바꾸면 반드시 올립니다.** 올리면 학생 브라우저의 예전 기록은 새 표와 섞이지 않고, 서랍을 열 때 「이전 기록 CSV 내려받기」로 건네준 뒤 지워집니다.
- `measurements[]`: `key`(camelCase, 겹치면 안 됨), `name`(한국어), `unit`(시뮬레이션 화면 단위, 없으면 `""`), `classUnit`(선택: `unit`, `factor`, `offset`; 수업 단위 값 = 값 × factor + offset).
  - `key`는 같은 양이면 `data/lessons/<id>.json`의 변수 키를 그대로 씁니다. 그래야 「공식·용어」 탭이 현재 값을 공식에 대입해 보여 줍니다.
  - 단위가 다르기만 하면(eV↔J, nm↔m) `classUnit`을 적습니다. 표·CSV·현재 값에 두 단위가 함께 나옵니다. 값은 시뮬레이션을 따릅니다.
  - 화면에 숫자가 없는 시뮬레이션은 모델 값을 측정 항목으로 꺼냅니다. 이 값은 **서랍 안에만** 나옵니다(실험 화면에 글자를 더하지 않음). 상대값이면 이름에 「(모델 값)」처럼 밝힙니다.
- `graphs[]`: **2개 이상**, 물리적으로 의미 있는 그래프. `id`(kebab-case, `free` 금지), `title`(한국어), `x`(키), `y`(키 또는 키 배열), `fit`(`"linear"` = 추세선과 기울기·절편 표시, `null`). 그래프 축은 시뮬레이션 단위입니다. 자유 그래프(학생이 x·y를 고름)는 서랍이 자동으로 더하며 수업 단위 열도 고를 수 있습니다.

### `adapter.mjs` (해시에 들어감, 실행 코드)

```js
const drawer = globalThis.bsshsDrawer;
drawer.register( {
  simId: '<id>',
  screenName: () => drawer.helpers.screenName(),          // 지금 화면의 한국어 이름
  read: () => ( { wavelength: 500, photonEnergy: null } ),  // drawer.json의 모든 키, 시뮬레이션 단위, 모르면 null
  apply: async params => { /* 자동 검사만 씀: 모델을 정해진 상태로 */ }
} );
```

- HTML 안에 인라인 모듈 스크립트로 들어가므로 **`import`를 쓸 수 없습니다**(주입기가 거부). `register`를 한 번만 부릅니다.
- `read()`는 서랍이 열려 있는 동안 0.5초마다 불리므로 가볍게. 숫자가 아니거나 무한대면 `null`로 기록됩니다. 예외가 나면 그 줄은 모두 `null`.
- `drawer.helpers`: `sim()`(`phet.joist.sim`), `screen()`, `model()`(선택된 화면의 모델), `isHomeScreen()`, `screenName()`(방향 표시 문자 제거, 홈 화면이면 「홈 화면」, 이름 없는 단일 화면이면 시뮬레이션 이름), `cleanName(s)`.
  68개 빌드의 joist 세 세대(`selectedScreenProperty` / `screenProperty` / `screenIndexProperty` + `showHomeScreenProperty`, 마지막 세대는 홈 화면이 `sim.screens` 밖에 있음)를 모두 처리합니다(`tests/drawer/helpers-joist.test.mjs`). 어댑터가 화면을 직접 찾을 필요가 없습니다.
- 모델 속성 이름은 시뮬레이션 버전마다 다릅니다. 빌드된 HTML을 브라우저에서 열고 `phet.joist.sim.screens[i].model`을 직접 살펴서 정합니다.

### `cases.json` (해시에 들어감, V3 물리 검사)

```json
[ { "name": "500 nm", "params": { "wavelength": 500 }, "expect": { "photonEnergy": { "value": 2.4797, "relTol": 0.001 } } } ]
```

`params`는 `apply()`에 그대로 넘어가고, `expect`의 키는 측정 항목 키입니다. 비교 규칙(`drawer/core.js`의 `checkExpect`, 실행기와 같은 코드):

- `value`가 0이 아니면 상대 오차: `|실제 − value| ≤ relTol × |value|`. `relTol`을 안 적으면 **1%(0.01)**, 실행기의 `--rel-tol`로 바꿀 수 있습니다.
- `value`가 0이면 상대 오차가 뜻이 없으므로 절대 오차: `|실제| ≤ absTol`, 기본 1e-9(`--abs-tol`로 바꿈). 0이 아닌 작은 값을 기대하면 0 대신 그 값을 적으세요.
- 값이 `null`(읽지 못함)이면 실패입니다.
- **허용 오차를 기본(1%)보다 느슨하게 정한 항목은 「참고」로 설명해야 합니다(사양 V3).** 사례는 허용 오차를 `relTol`로만 적으므로, `relTol > 0.01`인 측정 항목 키마다 `data/lessons/<id>.json`의 **공식 하나 이상**이 (1) `variables`에 그 키를 가지고 (2) `note`가 「참고」로 시작해야 합니다. 예: 반도체 `rippleVoltage`(6%)는 `ripple_voltage` 공식, 파동 간섭 `fringeSpacing`(4%)는 `fringe_spacing` 공식의 「참고: …」 줄. `tools/verify.mjs`의 V3가 검사하고(`toleranceNoteProblems`), 없으면 그 시뮬레이션의 V3가 실패합니다.

## 서랍이 하는 일

- **측정 기록**: 「기록」 = 지금 값 한 줄(시각, 화면, 측정 항목). 시뮬레이션마다 기록은 하나이고 화면을 바꿔도 같은 표에 「화면」 열로 구분됩니다. 시뮬레이션의 「모두 초기화」는 기록을 지우지 않습니다. 브라우저 `localStorage`의 `bsshs:log:<id>:v<schemaVersion>`에 저장되어 새로 고쳐도 남습니다(사이트 주소가 하나라 id로 구분). 맨 위 「새 실험 시작」(강조색)은 확인을 받은 뒤 그 시뮬레이션의 기록만 지웁니다. 저장소를 못 쓰는 브라우저에서는 안내를 띄우고 메모리에만 둡니다.
- **그래프**: 미리 정한 그래프 + 자유 그래프, 화면별로 거르기, `fit: "linear"`이면 최소제곱 직선과 기울기·절편·R². PNG로 내려받기.
- **공식·용어**: 수업 공식·용어, 「수업 강조」「참고 · 시험 범위 아님」 표시, 공식의 「참고」 한 줄. 공식의 모든 변수가 상수이거나 측정 항목이면 현재 값을 대입해 보여 줍니다(수업 단위로 바꿔서). 레슨 파일의 `sources`는 주입 단계에서 빼므로 HTML에 들어가지도 않습니다(공개 필드만: `id, title, unit, formulas, terms, classUnits`).
- **내보내기**: CSV는 UTF-8 BOM으로 시작해 엑셀에서 한글이 깨지지 않습니다. 서버·로그인·제출은 없습니다.
- **확인 상태**: 머리에 「선생님 확인 중 / 선생님 확인 완료 / 수정 중」. 선생님 이름과 `memo`는 표시하지 않습니다. 수정 중이어도 기능은 그대로입니다.

## 확인 상태와 물리 내용 해시 (`drawer/hash.mjs`, `drawer/status.mjs`)

- `physicsHash(id, { repoRoot })` = sha256(hex). 들어가는 것: `data/lessons/<id>.json`, `adapters/<id>/drawer.json`, `adapters/<id>/cases.json`, `adapters/<id>/adapter.mjs`, 새 시뮬레이션이면 `sims/<id>/js/model/**`. 빠지는 것: 디자인 토큰·테마·브랜드·용어 고치기·서랍 코드(배치·모양). JSON은 키 정렬·공백 제거한 형태로 해시하므로 줄 바꿈만 바꾸면 해시가 그대로입니다. 없는 파일도 「없음」으로 들어갑니다.
- `physicsHashInputs(id)`로 어떤 파일이 들어갔는지 볼 수 있습니다. 범위를 바꾸면 `HASH_SCOPE_VERSION`을 올립니다(모든 확인이 다시 「확인 중」이 됨).
- `data/verification-status.json`: `{ "<id>": { "status": "확인 중|확인 완료|수정 중", "date": "YYYY-MM-DD", "memo": "", "approvedHash": "<확인 완료일 때만>" } }`. `validateStatusFile()`로 검사합니다.
- `resolveStatus(entry, hash)`: 확인 완료인데 해시가 다르면 「선생님 확인 중」으로 보입니다. 항목이 없으면 확인 중.
- `tools/approve`, `tools/set-status`(T12)는 **`physicsHash()`를 불러 씁니다.** 다시 구현하지 마세요.
- 상태는 주입할 때 계산해 HTML에 넣으므로, 상태 파일을 바꾸면 다시 주입해야 화면에 반영됩니다.

## 브라우저 API: `window.bsshsDrawer`

`register(adapter)`, `read()`(지금 값, 기록하지 않음), `screenName()`, `open(tab?)`(`'log'|'graphs'|'lessons'`), `close()`, `isOpen()`, `record()`, `rows()`, `clear()`(확인 없이), `exportCsv(): string`, `exportPng(graphId|'free'): Promise<Blob>`, `fits(graphId)`, `status()`, `hash()`, `legacy()`, `layout()`(`{ mode: 'side'|'sheet', open }`), `buttonRect()`, `apply(params)`(어댑터의 `apply`), `helpers`, `mounted`, `adapterRegistered`.
서랍은 시뮬레이션이 다 만들어지고 시작 화면이 사라진 뒤에 붙습니다(`mounted`).

## 구조와 디자인 값

- `drawer/core.js`(순수 계산: CSV·단위·직선 맞춤·대입), `drawer/runtime.js`(화면), `drawer/drawer.css`, `drawer/config.mjs`, `drawer/inject.mjs`, `drawer/hash.mjs`, `drawer/status.mjs`.
- 주입 묶음은 `</body>` 바로 앞 `<!-- bsshs-drawer:begin … -->` ~ `<!-- bsshs-drawer:end -->`: 토큰 CSS 변수(`toCssVariables()`), 데이터 JSON, core, runtime, 어댑터. 외부 주소는 하나도 없습니다(`check-sim`의 `network` 검사 통과). 다시 넣으면 앞 묶음을 바꿔 끼웁니다.
- 화면은 shadow DOM 안에 있어 시뮬레이션 CSS와 서로 섞이지 않습니다. 서랍 안에서 시작한 포인터·터치·휠·키·포커스 이벤트는 시뮬레이션(scenery는 window/document에서 받음)으로 가지 않습니다.
- 색·글꼴·글자 크기·모서리·간격·그림자는 모두 `--bsshs-*` 변수(`theme/tokens.json`)이고, 그래프 캔버스 색도 그 변수에서 읽습니다. 터치 영역(`size.touchTarget`, 44px), 기준 폭(`breakpoint.sheet` 600px, `breakpoint.large` 1600px), 서랍 폭·시트 높이·움직임 시간·층 순서·새로 읽는 간격(`drawer.*`), 큰 화면 본문 글자(`font.sizes.largeScreenBody`, 18px)도 `theme/tokens.json`에 있습니다([theme.md의 「서랍 키」](theme.md#서랍-키-drawer-keys)). `drawer/config.mjs`는 그 값을 읽어 CSS 자리표시자에 넣을 뿐 숫자를 갖지 않습니다(`tests/drawer/literals.test.mjs`, `tests/theme/no-literals.test.mjs`가 `drawer/`도 검사).
- 화면의 숫자(표, 현재 값, 그래프 축)는 유효숫자 4자리이고, 아주 크거나 작으면 `6.667×10⁻⁴`처럼 위첨자 지수로 씁니다. CSV는 기계가 읽을 수 있게 `0.0006667`, `6.667e-7` 같은 보통 숫자 표기 그대로입니다(위첨자 없음).
- 휴대폰 시트 모드에서 열기 버튼은 오른쪽 위 모서리(세로 화면에서 시뮬레이션 위아래가 비는 자리), 그보다 넓으면 오른쪽 가장자리 가운데에 있습니다. 버튼에는 그림자를 두지 않습니다(비교 도구가 버튼 상자만 빼기 때문).

## `tools/compare-layout.mjs` (V9)

```
node tools/compare-layout.mjs <a.html> <b.html> [--width 1280] [--height N] [--exclude-button]
     [--all-screens | --first-screen] [--pause-clock] [--seed-random]
     [--settle 1500] [--timeout 30000] [--max-diff-pixels 0] [--tolerance 0] [--diff out.png]
```

두 파일을 `check-sim`과 같은 방법(600px 미만은 CDP 기기 화면 흉내, DPR 3, 터치)으로 열고, 시뮬레이션 준비(+ 서랍이 있으면 `mounted`)를 기다린 뒤 화면을 찍어 픽셀을 비교합니다. `--exclude-button`은 `a`의 `buttonRect()`를 장치 픽셀로 바깥쪽 반올림한 상자와 그 둘레 장치 픽셀 1줄(글자·모서리 안티앨리어싱 번짐)만 뺍니다. JSON 한 개를 출력하고 끝 코드 0 = 같음, 1 = 다름, 2 = 사용법·브라우저 오류.
발전기 학교판 빌드에서 1280·390 모두 다른 픽셀 0개였고, 닫힌 서랍이 24px 띠를 덮게 일부러 고치면 실패합니다(`tests/drawer/browser-real.test.mjs`).

### 모든 화면 비교 (V9, 기본)

- `--all-screens`(기본): 첫 화면만이 아니라 **홈 화면(있으면) + 시뮬레이션 화면 하나하나**를 두 파일에서 같은 순서·같은 방법(joist 자신의 화면 속성: `selectedScreenProperty`, `screenProperty`, 옛 joist는 `showHomeScreenProperty` + `screenIndexProperty`)으로 골라 찍고 화면마다 비교합니다. 화면마다 `--settle` ms를 기다립니다. `--first-screen`을 주면 예전처럼 처음 보이는 화면 하나만 찍습니다.
- 출력: 예전 필드(`diffPixels`·`totalPixels`는 모든 화면의 합, `excluded`·`diffBox`는 첫 화면)에 더해 `screens[]`(`index`(-1 = 홈), `name`, `diffPixels`, `diffBox`, `excluded`, `ok`, `shotSha1`, `diffImage`). `shotSha1`이 화면마다 달라야 화면 전환이 실제로 그려진 것입니다. 끝 코드: 모든 화면이 `--max-diff-pixels` 이하일 때만 0. `--diff x.png`이면 화면마다 `x.screenN.png`.
- `--pause-clock`: 첫 화면을 찍은 뒤 두 파일 모두 joist 시계(`sim.activeProperty`)를 멈추고, 다음 화면부터는 시간 간격 0으로 한 번 그려서 찍습니다. joist는 선택된 화면의 모델만 움직이므로, 처음 고른 화면은 만들어진 그대로의 상태가 되어 두 파일이 같아집니다. 계속 움직이는 화면(수소 원자 「에너지 준위」의 전자, 기하 광학의 빛줄기)은 **서랍 없는 빌드끼리 비교해도** 매번 픽셀이 달라서 이것이 필요합니다.
- `--seed-random`: 페이지 스크립트보다 먼저 두 파일의 `Math.random`을 같은 시드 생성기로 바꿉니다. 화면을 만들 때 무작위로 장식을 그리는 시뮬레이션(`bsshs-semiconductor`의 「PN 접합」 결정 그림)은 이것 없이는 서랍 없는 빌드끼리도 다릅니다. 서랍 코드는 `Math.random`을 쓰지 않습니다.
- 시험 범위 14개 확인 명령: `node tools/compare-layout.mjs build/…/<id>_ko.html(서랍) build/bsshs-theme/<id>/<id>_ko.html --width 1280|390 --exclude-button --all-screens --pause-clock --seed-random`.

### 휴대폰 시트와 그래프 글자

- 세로 휴대폰에서 PhET은 실험 화면을 가운데 띠로 두고 위아래를 비웁니다. 시트는 **선택된 화면의 놀이 영역(ScreenView `layoutBounds`) 아래 공간만** 덮도록 높이를 정하고, `drawer.sheetMinHeight`(40vh)~`drawer.sheetHeight`(72vh) 안으로 자릅니다. 시뮬레이션은 덮일 뿐 옮기거나 다시 배치하지 않습니다(`tests/drawer/sheet-visible.test.mjs`가 시트 위 픽셀이 한 색이 아닌지, 열기 전후 배치가 같은지 확인).
- 그래프 캔버스의 모든 글자는 그리기 전에 잽니다. 제목·x축 이름·추세선 글은 캔버스 폭에 맞춰 줄을 바꾸고, 세로축 이름은 그래프 높이에 맞춰 `drawer.graph.labelMaxLines`(3)줄까지 바꾼 뒤 넘치면 「…」로 줄입니다. 여백은 글자에 맞춰 늘고, 서로 겹치거나 캔버스를 벗어날 눈금 숫자는 건너뜁니다. 화면의 캔버스는 그래프가 원래 높이의 절반보다 작아지면 그만큼 키가 커집니다(`tests/drawer/graph-text.test.mjs`가 14개 서랍의 모든 그래프를 390·1280·1600에서 글자 상자로 검사).

## 시험 범위 id의 필수 파일 (사양 2.3)

`data/exam-scope.json`의 모든 id에는 `adapters/<id>/adapter.mjs`, `adapters/<id>/drawer.json`, `adapters/<id>/cases.json`, `data/lessons/<id>.json`이 모두 있어야 합니다. 하나라도 없으면 `npm run build-site`/`build-everything`(그리고 `tools/inject-drawer.mjs`)이 실패하고 **빠진 파일을 한꺼번에 전부** 출력합니다. 수업 내용이 없는 서랍은 더 이상 만들어지지 않습니다.

## `tools/run-cases.mjs` (V3 물리 검사 실행기)

```
node tools/run-cases.mjs <서랍 넣은.html> <id> [--width W] [--height H] [--cases 파일 | --adapter-dir 폴더]
     [--rel-tol 0.01] [--abs-tol 1e-9] [--settle 300] [--settle-timeout 5000] [--timeout 30000]
```

`adapters/<id>/cases.json`(기본)의 경우마다 페이지를 새로 열고(경우끼리 영향 없음, `check-sim`과 같은 화면 설정), `bsshsDrawer.apply(params)` → 어댑터의 `apply`로 모델을 맞춥니다. `--settle` ms를 기다린 뒤 `expect`의 양이 0.1초 간격으로 세 번 연속 같을 때까지(최대 `--settle-timeout`) `bsshsDrawer.read()`를 읽고 위 규칙으로 비교합니다.
출력은 경우마다 JSON 한 줄(`{"type":"case","name","ok","settled","params","screen","results":[{"key","expected","actual","mode":"relative|absolute","tol","error","ok"}],"error","ms"}`)과 마지막 `{"type":"summary","ok","passed","failed",…}` 한 줄입니다. 끝 코드 0 = 모두 통과, 1 = 하나라도 실패(또는 실행 못 함, 페이지 오류), 2 = 사용법·파일·브라우저 오류(다른 시뮬레이션의 서랍이 든 파일 포함).
움직임이 멈추지 않는 양이면 `settled: false`로 남고 마지막 값으로 비교합니다. 그런 양은 `apply`에서 일시 정지 등으로 상태를 고정하세요.

## 테스트

`npm test`에 들어 있습니다. `tests/drawer/*.test.mjs`: 순수 계산, 해시 범위, 상태, 주입, 디자인 값 금지 검사, 가짜 시뮬레이션 페이지(`tests/fixtures/drawer/`)의 브라우저 검사, 실제 학교판 빌드(발전기, 패러데이 전자기 실험실)의 브라우저 검사.
실제 빌드 검사는 `$BSSHS_BUILD_DIR` 또는 `build/bsshs-theme/<id>/<id>_ko.html`이 있어야 하고, 없으면 이유를 적고 건너뜁니다. 결과 파일은 `build/test-drawer/`에 씁니다.
