# theme/ — 디자인 토큰과 PhET 소스 패치

## 맡는 것

- `tokens.json`: 프로젝트의 모든 디자인 값(색, 글꼴, 자간, 모서리, 간격, 그림자, 터치 크기, 기준 폭, 서랍 치수·움직임·그래프 수치, 사이트 수치, PhET 역할 → 토큰 키 연결, 시뮬레이션 안쪽 색 `sim.*`와 검사 기준값 `sim.check.*`). 이 파일 밖에는 값이 없다.
- `index.mjs`: 토큰 읽기·검사(`loadTokens`, `validateTokens`, `validateSimTokens`), CSS 변수 만들기(`toCssVariables` → `--bsshs-*`), 글꼴 목록(`fontStack`, `fontFaces`), PhET 패치용 값(`toPhetColors`, `toPhetTheme`), 시뮬레이션 안쪽용 팔레트와 자리표시자(`simPalette`, `resolveColorToken`, `resolveSvgPlaceholders`), `tokensHash`.
- `inject.mjs`: 빌드된 HTML의 `<meta charset>` 바로 뒤에 `<!-- bsshs:begin … -->` ~ `<!-- bsshs:end -->` 묶음(브랜드 메타, 워드마크 지문, OFL 주석 + `@font-face` data URI + 변수, 글꼴 미리 불러오기 스크립트)을 넣는다. 다시 넣어도 결과가 같다.
- `patches/engine.mjs`: 패치 규칙 적용·되돌리기 엔진. `patches/theme.mjs`(테마 규칙: 공통 색·글꼴 7개와 평면 부품 20개, 모두 27개), `patches/telemetry.mjs`(외부 통신 끄기 3개), `patches/terms.mjs`(용어 교정 → babel 한국어 문자열 규칙), `patches/index.mjs`(`ALL_RULES`, `rulesFor`, `patchContext`, `simRulesFor`, `variantHash`, `simVariantHash`), `patches/sim-color.mjs`(시뮬레이션별 색 글자 규칙), `patches/art.mjs`(그림 파일·모듈 바꾸기), `patches/color-inventory.mjs`(색 글자 조사), `patches/dry-run.mjs`(체크아웃 없이 63개 버전에 전체 규칙과 시뮬레이션별 규칙 미리 적용). `sim-style.mjs`: `sim-styles/<id>.json` 읽기·검사·예외 규칙. `sim-tokens-module.mjs`: 원본 시뮬레이션(`sims/`)이 쓰는 토큰 모듈(`js/view/SimTokens.ts`)의 글을 `build-new-sim`이 스테이징 때만 만든다(커밋하지 않음). `sim-styles/`: 시뮬레이션별 색 파일. `art/`: `map.json`과 SVG 그림.
- `fonts/`: 수정하지 않은 글꼴 원본과 OFL 라이선스, 출처(`SOURCES.txt`).

## 맡지 않는 것

- 학교 표기의 내용(워드마크 그림, 출처 문구, 브랜드 규칙)은 `brand/bsshs/`가 갖는다. 여기서는 `ALL_RULES`에 합치기만 한다.
- 빌드 순서·슬롯·chipper 실행은 `tools/`의 일이다.
- 서랍 CSS·사이트 CSS의 내용은 `drawer/`·`site/`가 갖는다. 여기는 값만 준다.
- 용어 교정 목록 자체는 `data/term-fixes.json`이다. `terms.mjs`는 적용 방법만 갖는다.
- 실험 화면 배치(요소의 위치·크기)와 글자(문구·크기), 모델 파일(경로에 `model`이 든 파일)은 건드리지 않는다. 시뮬레이션별 색과 그림은 건드린다: 시뮬레이션 안쪽 그래픽도 토큰으로 옮기는 것이 사양 3.1이다(하늘색 바탕, 입체 버튼, 굵은 검은 테두리, 사진 같은 그림 포함).

## 지켜야 할 것

- 규칙 종류는 `theme`·`brand`·`telemetry`·`terms`에 시뮬레이션 하나에만 쓰는 `sim-color`·`art`를 더한 여섯이다. 규칙이 건드릴 수 있는 파일은 `tools/lib/verify-core.mjs`의 `PATCH_ALLOWLIST`가 정한다: `theme`은 `scenery-phet`의 `PhetFont`·`PhetColorScheme`·`ShadedSphereNode`·`ShadedRectangle`·`NumberDisplay`·`ProbeNode`·`SpectrumSlider`, `joist` `LookAndFeel`·`HomeScreen`, `sun`의 `ColorConstants`·`Panel`·`Checkbox`·슬라이더(손잡이·트랙)·`AccordionBox`·`ComboBox*`·`Carousel`·`PageControl`·`NumberPicker`·`ExpandCollapseButton`과 `js/buttons/`의 `ButtonNode`·`Rectangular(Button|ButtonView|RadioButtonGroup)`·`Round(Button|ButtonView)`·`ArrowButton`·`CarouselButton`. `telemetry`는 `phetcommon` 통계 스크립트, `joist` 업데이트 확인, `chipper` `initialize-globals`. `terms`는 babel의 `<저장소>/<저장소>-strings_ko.json`만. `sim-color`는 `babel`·`chipper`·`perennial-alias`·`brand`가 아닌 저장소의 `js/` 소스, `art`는 `images/`·`mipmaps/`의 `*.png`·`*_png.js`·`*_png.ts`·`license.json`. 모든 종류에서 경로에 `model/`이 든 파일은 거절한다. 이 밖의 파일을 후보로 적으면 검증이 실패한다.
- 규칙은 커밋된 원본(`git show HEAD:<파일>`)을 변환한다. 작업 사본을 읽지 않는다. 한 번의 `applyPatchRules` 안에서 같은 파일의 뒤 규칙은 앞 규칙 출력 위에서 이어진다. 바뀔 파일은 쓰기 전에 `touched`에 넣어, 뒤 규칙이 던져도 호출자의 `finally`가 되돌릴 수 있게 한다.
- 후보 파일 존재 여부는 git에 묻는다(맥 파일 시스템은 대소문자를 구분하지 않는다).
- 필수 규칙은 후보가 없거나 정규식이 하나도 안 맞으면 던진다. 선택(`optional`) 편집은 옛 계열에 그 줄이 없을 때만 쓴다.
- PhET 원래 값을 찾는 패턴은 정규식으로 쓴다(`/rgb\(\s*50, …/`). 색·글꼴 이름을 문자열로 쓰면 디자인 값 검사가 실패한다.
- 색 토큰은 `#rgb`·`#rrggbb`·`rgb()`·`rgba()`만. `phet.*` 키에는 값이 아니라 토큰 키 이름을 쓴다.
- 시뮬레이션에는 자간·글자 크기를 넣지 않는다(캔버스 글자 폭이 바뀌어 배치가 달라짐). 메뉴줄 배경은 PhET 흰색 그대로 둔다(joist가 `'white'`/`'black'`과 비교).
- 시뮬레이션에 넣는 글꼴은 `embedInSims: true`인 Geist 가변 글꼴 하나다. Instrument Serif·Geist Mono는 사이트·서랍용이다.
- `tokens.json`(`sim` 묶음 밖)이나 전체 규칙(id, 후보 파일, 찾는 정규식, 바꾸는 코드)을 바꾸면 `variantHash`가 바뀌어 68개가 모두 다시 빌드된다. 의도한 변경인지 확인한다. `sim` 묶음 토큰, 시뮬레이션의 `sim-styles/<id>.json` `colors`, 그 시뮬레이션이 쓰는 `art` 그림은 그것을 쓰는 시뮬레이션의 해시에만 들어간다(`simVariantHash`).
- **시뮬레이션별 색 규칙**(`sim-styles/<id>.json`): 색 값은 쓰지 않는다. `find`는 정규식 글, `to`는 토큰 경로. 색 문법에 맞는 글자만 바꾸고(그 밖이면 멈춤), 모델 파일은 거절하고, 바꾼 자리 밖이 달라지면 멈추고, `Color.이름`은 `new Color( … )`로 바꾼다. 모델 파일의 색은 `exceptions`에 이유와 `approvedBy`를 적는다(시뮬레이션당 20건 이하).
- **그림 규칙**(`art/map.json`): SVG의 `width`·`height`가 원본 PNG와 다르면 빌드가 실패한다. 색은 `{{sim.physics.copper}}` 자리표시자. 새 그림은 `license.json`에 이 프로젝트의 새 저작물(GPL-3.0)로 적힌다. 모양을 모르는 모듈이나 `license.json`이 없는 폴더는 멈춘다.

## 작업 방식

새 테마 규칙:

```js
{ id: 'theme-…', kind: 'theme', repo: 'sun', files: [ 'js/Foo.ts', 'js/Foo.js' ], required: true,
  edits: [ { find: /fill:\s*ColorConstants\.LIGHT_BLUE/g, replace: env => `fill: '${env.phet.pushButtonBase}'` } ],
  why: 'one line for reviewers' }
```

후보 파일은 새 계열(`.ts`)과 옛 계열(`.js`)을 함께 적는다. `env.isTs`로 문법을 나눈다. 63개 버전의 파일 모양이 제각각이므로, 규칙을 쓰기 전에 `node theme/patches/dry-run.mjs`로 버전별 적용 수를 본다.

## 테스트

- `tests/theme/`: 토큰 형식(`tokens.test.mjs`, `sim-tokens.test.mjs`), 디자인 값이 토큰 밖에 없음(`no-literals.test.mjs`, 대상 `theme/ brand/ tools/ drawer/ adapters/ site/`), 규칙 단위 변환(`patches.test.mjs`), 머리 삽입(`inject.test.mjs`), 빌드 종류(`build-variant.test.mjs`), 출처 문구(`attribution.test.mjs`), check-sim 판정(`check-sim.test.mjs`), 시뮬레이션별 색 규칙(`sim-color.test.mjs`), 그림(`art.test.mjs`), 시뮬레이션별 해시(`sim-hash.test.mjs`), 평면 부품 규칙(`flat-components.test.mjs`), 그린 그림 점검(`art-pilot.test.mjs`). `tests/new-sims/sim-tokens-module.test.mjs`는 토큰 모듈과 스테이징을 본다.
- `tests/terms/`: 교정 목록 모양, 쓸모없는 교정 없음, 제목 일치, 빌드 결과, 같은 파일 규칙의 합성(`compose.test.mjs`).
- 규칙을 더하면: 그 규칙이 고정 버전 원본에서 기대한 곳만 바꾸는지 단위 테스트를 더하고, `dry-run.mjs`에서 필수 규칙 적용 수가 0인 버전이 없는지 확인하고, 학교판을 다시 빌드한 뒤 check-sim과 V9·V10b를 돌린다.
- 경계 사례: 옛 RequireJS 계열(16개)의 `.js` 파일, 문자열 배치가 평평한 키인 계열과 중첩 객체인 계열, 대소문자만 다른 파일 이름.
