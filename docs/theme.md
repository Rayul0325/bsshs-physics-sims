# 공통 디자인(토큰)·학교 표기·외부 통신 끄기

PhET 시뮬레이션을 학교판(`bsshs`)으로 다시 빌드하는 방법과, 그때 쓰는 디자인 값·브랜드·검사 도구를 정리합니다.
원본 빌드 방법은 [build.md](build.md)를 보세요.

## 한 번에 하기

```sh
npm install                                             # playwright (설치된 Google Chrome 사용, 브라우저 내려받기 없음)
node tools/build-sim.mjs faradays-law --brand bsshs --theme    # 학교판 하나
node tools/build-all.mjs --brand bsshs --theme --jobs 10       # 학교판 63개
node tools/check-sim.mjs build/bsshs-theme/faradays-law/faradays-law_ko.html            # 데스크톱 검사
node tools/check-sim.mjs build/bsshs-theme/faradays-law/faradays-law_ko.html --width 390 # 휴대폰 폭 검사
node theme/patches/dry-run.mjs                          # 패치 규칙(전체 + 시뮬레이션별 색·그림)이 63개 고정 버전 모두에 맞는지 (체크아웃 없이)
node theme/patches/color-inventory.mjs faradays-law     # 한 시뮬레이션의 색 글자 목록과 처리 안 된 개수
node tools/check-style.mjs build/bsshs-theme/faradays-law/faradays-law_ko.html   # 안쪽 팔레트 검사(V11)
node tools/compare-bounds.mjs faradays-law              # 고정본과 요소 위치·크기 비교(V12)
```

## 빌드 종류(variant)와 플래그

| 플래그 | 이름 | 결과 파일 | 빌드 기록 |
| --- | --- | --- | --- |
| (없음) | `baseline` | `build/<id>/<id>_ko.html` | `data/build-matrix.json` |
| `--brand bsshs` | `bsshs` | `build/bsshs/<id>/<id>_ko.html` | `data/build-matrix.bsshs.json` |
| `--brand bsshs --theme` | `bsshs-theme` (배포용) | `build/bsshs-theme/<id>/<id>_ko.html` | `data/build-matrix.bsshs-theme.json` |
| `--theme` | `theme` | `build/theme/<id>/<id>_ko.html` | `data/build-matrix.theme.json` |

- 플래그가 없으면 예전과 **똑같이** 동작합니다(같은 출력 위치, 같은 행렬, 패치·삽입 없음). 나중 작업의 화면 비교 기준으로 씁니다.
- `--brand bsshs` = 학교 표기(워드마크·About 출처 표기) + 외부 통신 끄기. `--theme` = 디자인 토큰(색·글꼴).
- 빌드 로그: 원본은 `build/logs/<id>.log`, 다른 종류는 `build/logs/<variant>/<id>.log`.
- 행렬 기록에 `variant`, `brandId`, `theme`, `themeHash`, `patches`(규칙별 적용 결과 한 줄씩)가 더 붙습니다.
  `themeHash`가 바뀌면(토큰·규칙 변경) 이어서 빌드할 때 다시 빌드합니다. 워드마크 그림 크기 같은 코드 변경은 `--force`로 다시 빌드하세요.

## 디자인 토큰: `theme/tokens.json` 한 곳

디자인 값(색, 글꼴, 자간, 모서리, 간격, 그림자)은 **`theme/tokens.json`에만** 씁니다. 다른 파일에 값을 쓰면 `tests/theme/no-literals.test.mjs`가 실패합니다
(검사 대상: `theme/`, `brand/`, `tools/`의 코드. 16진 색, `rgb()`류 색 함수, 값이 적힌 `font-family:`, 토큰의 글꼴 이름).
PhET 원본 값을 **찾는** 패턴은 정규식으로 적어서(예: `/rgb\(\s*50, …/`) 검사에 걸리지 않습니다.

값의 출처는 학생 앱 BSS Drive(`~/orca/projects/BSS-Drive`, 읽기 전용)입니다: `src/app/globals.css`의 `:root`(밝은 테마)·`.dark`(어두운 테마) 변수,
`src/app/layout.tsx`의 Geist + Instrument Serif와 `tracking-[-0.02em]`. 성공·경고·위험 색은 BSS Drive가 쓰는 Tailwind v4 `green/amber/red-600`(oklch)을 sRGB 16진으로 바꾼 값입니다.

| 키 | 뜻 (BSS Drive 출처) |
| --- | --- |
| `meta` | 이름·설명·출처 기록(값 아님) |
| `color.bg` | 페이지 배경 (`--background`) |
| `color.surface` | 카드·패널 면 (`--card`) |
| `color.surfaceAlt` | 보조 면 (`--secondary`) |
| `color.text` | 본문 글자 (`--foreground`) |
| `color.textMuted` | 흐린 글자 (`--muted-foreground`) |
| `color.textSubtle` | 더 흐린 글자 (`--text-tertiary`) |
| `color.border` | 얇은 테두리 (`--border`) |
| `color.borderStrong` | 잘 보여야 하는 테두리, PhET 패널 테두리 (`--text-tertiary`) |
| `color.accent` | 강조색 (`--primary`) |
| `color.accentText` | 강조색 위 글자 (`--primary-foreground`) |
| `color.accentSoft` / `color.accentSoftText` | 옅은 강조 배경 / 그 위 글자 (`--accent` / `--accent-foreground`) |
| `color.accentBright` | 밝은 강조 (`.dark --primary`, `--chart-3`) |
| `color.control` | PhET 기본 버튼 바탕색 (`--chart-4`) |
| `color.focus` | 포커스 테두리 (`--ring`) |
| `color.success` / `color.warning` / `color.danger` | 성공 / 경고 / 위험 (`green-600` / `amber-600` / `red-600` = `--destructive`) |
| `color.inverseBg` / `color.inverseSurface` / `color.inverseText` | 어두운 면 / 어두운 카드 / 어두운 면 위 글자 (`.dark` 의 `--background` / `--card` / `--foreground`) |
| `font.sans` / `font.serif` / `font.mono` | 글꼴 이름: 본문 / 강조(워드마크·제목 악센트) / 고정폭 |
| `font.koreanFallback` | 한글 대체 글꼴 목록. **바꿔도 되는 기본값**: 지금은 기기에 이미 있는 글꼴만 써서 내려받기가 없습니다(Pretendard 등을 넣으려면 `faces`에 파일도 추가) |
| `font.genericSans` / `genericSerif` / `genericMono` | 마지막 일반 글꼴 이름 |
| `font.wordmarkWeight` | 워드마크 굵기 |
| `font.sizes.*` | 사이트·서랍용 글자 크기(Tailwind 기본 단계 `xs`~`3xl`). 시뮬레이션 안의 글자에는 쓰지 않음 |
| `font.sizes.wordmark` / `font.sizes.splash` | 워드마크 로고 PNG(높이 96px 그림 안) / 시작 화면 SVG(273×130 안)의 글자 크기 |
| `font.faces[]` | 글꼴 파일 목록: `family`, `file`, `weight`, `style`, `license`(옆의 OFL 파일), `embedInSims`(시뮬레이션에 넣을지) |
| `tracking.tight` / `tracking.normal` | 자간 (`-0.02em`은 BSS Drive 본문) |
| `radius.*` | 모서리 둥글기. `--radius 0.75rem`과 Tailwind 배수(0.6·0.8·1·1.4·1.8) |
| `space.*` | 간격(4px 단위) |
| `shadow.card` / `shadow.glow` | 카드 그림자 / 강조 빛 (`.content-card`, `--accent-glow`) |
| `phet.*` | PhET 역할 → 토큰 **이름** 연결(값이 아니라 키 이름): `navigationBarText`, `homeScreenBackground`, `pushButtonBase`, `panelFill`, `panelStroke`(`sim.line`), `panelCornerRadius`(radius 키), `checkbox`, `sliderThumb`, `sliderThumbHighlight`, `wordmarkOnWhite`, `wordmarkOnBlack`, `splashText`, 그리고 평면 부품용 `buttonStroke`, `resetAllButton`, `zoomButton`, `componentFill`, `componentStroke`, `componentHighlight`, `componentText`, `componentAccent`, `componentMuted`, `selectedStroke` |
| `sim.canvas` / `sim.canvasDark` | 시뮬레이션 안쪽 캔버스 바탕: 밝은 것(`color.bg`와 같은 값) / 어두운 것. 우주나 빛의 방출처럼 어두운 바탕이 있어야 보이는 화면이 쓴다. 순수 검정이 아니다 |
| `sim.surface` / `sim.line` | 시뮬레이션 안쪽 흰 카드·패널 면 / 옅은 회색 선 |
| `sim.control` / `sim.controlActive` | 평면 버튼 바탕 / 눌린·선택된 버튼 바탕. 파란 강조색 하나(글자색 흰색과 4.5:1 이상이 되도록 `color.accent`보다 한 단계 진함) |
| `sim.text` / `sim.textOnDark` | 밝은 바탕 위 글자 / 어두운 바탕 위 글자 |
| `sim.physics.*` | 물리적 뜻이 있는 색을 평면 색 하나로: `positive`(양전하), `negative`(음전하), `electron`, `proton`, `neutron`, `magnetN`, `magnetS`, `copper`, `conductor`, `insulator`, `forceA`·`forceB`(힘 화살표 두 가지), `energy`, `light`, `water`, `glass`. 밝은 캔버스와 어두운 캔버스 둘 위에서 모두 보이는 중간 밝기로 골랐다 |
| `sim.check.*` | 검사 기준값(색이 아닌 숫자): `paletteTolerance`(팔레트와 같다고 보는 채널당 차이, 0~255), `outsideShareMax`(화면 픽셀 중 팔레트 밖 색의 허용 비율), `minContrast`(글자 대비 최소 비), `boundsTolerance`(요소 위치·크기 허용 오차, px), `maxExceptions`(시뮬레이션당 예외 최대 수) |

색은 PhET의 `Color`가 읽을 수 있는 `#rgb`/`#rrggbb`/`rgb()`/`rgba()`만 씁니다(oklch 불가). `loadTokens()`가 검사합니다.

### `theme/index.mjs`

- `loadTokens(file?)` — 읽고 검사(틀리면 오류)
- `validateTokens(t)` — 문제 목록
- `toCssVariables(tokens, { selector })` — `--bsshs-*` CSS 변수 글. 이름 규칙: `--bsshs-color-surface-alt`, `--bsshs-font-sans`(글꼴 목록 전체), `--bsshs-font-korean-fallback`, `--bsshs-font-size-<키>`, `--bsshs-font-wordmark-weight`, `--bsshs-tracking-<키>`, `--bsshs-radius-<키>`, `--bsshs-space-<키>`, `--bsshs-shadow-<키>` (카멜 표기는 `-`로 나눔). 사이트와 서랍은 이것을 씁니다.
- `fontStack(tokens, 'sans'|'serif'|'mono', { generic })` — `글꼴, 한글 대체…, 일반 글꼴`
- `toPhetColors(tokens)` / `toPhetTheme(tokens)` — PhET 패치가 쓰는 값
- `fontFaces(tokens, { simsOnly })` — 글꼴 파일(절대 경로)
- `simPalette(tokens)` — 시뮬레이션이 쓸 수 있는 색 목록 `{ path, value, rgba }`. `color.*`와 `sim.*`(`sim.physics.*` 포함)의 색 토큰 전부이고, 검사(V11)의 팔레트가 된다
- `resolveColorToken(tokens, 'sim.physics.copper')` — 경로로 색 값을 찾는다. 색 토큰이 아닌 경로면 오류
- `resolveSvgPlaceholders(svg, tokens)` / `svgPlaceholders(svg)` — SVG 글 안의 `{{sim.physics.copper}}` 자리표시자를 토큰 색으로 바꾼다 / 어떤 토큰을 쓰는지 목록. 모르는 자리표시자는 오류라서 오타가 그림에 들어가지 못한다
- `validateSimTokens(sim)`, `parseTokenColor(value)`, `SIM_PHYSICS_KEYS`, `SIM_CHECK_KEYS`
- `flattenTokens`, `tokensHash` (`sim` 묶음은 CSS 변수로 내보내지 않는다. 시뮬레이션 안쪽 규칙이 경로로 찾아 쓴다)

## 글꼴

- 파일은 `theme/fonts/`에 있고 바로 옆에 라이선스(`OFL-Geist.txt`, `OFL-InstrumentSerif.txt`)와 출처(`SOURCES.txt`)가 있습니다. 수정하지 않은 원본입니다(Geist 1.9.0, Instrument Serif는 @fontsource 5.3.0).
- 시뮬레이션에는 `embedInSims: true`인 Geist 가변 글꼴 하나(70 KB, base64로 약 93 KB)만 **HTML 안에 data: URI로** 넣고, OFL 전문을 같은 `<style>`의 주석으로 함께 넣습니다. 그래서 글꼴 때문에 다른 곳에 요청하지 않습니다.
  Instrument Serif·Geist Mono는 사이트·서랍용(시뮬레이션에 안 넣음).
- 한글은 Geist에 없으므로 `font.koreanFallback`의 기기 글꼴(맥·아이폰 Apple SD Gothic Neo, 윈도 맑은 고딕, 안드로이드 Noto Sans KR 등)로 그려집니다.
- 삽입된 스크립트가 문서를 읽는 순간 글꼴을 미리 불러오고, 결과를 `window.bsshsFonts`(`loaded`, `readyBeforeSim`)에 남깁니다.

## 무엇이 바뀌고 무엇이 그대로인가

두 층으로 바꿉니다. 공통 부품 층(`theme/patches/theme.mjs`)은 모든 시뮬레이션에 같은 규칙을 적용하고, 시뮬레이션별 층(아래 「시뮬레이션 안쪽 디자인」)은 시뮬레이션 하나의 색 글자와 그림 파일을 바꿉니다.
바뀌지 않는 것은 실험 화면의 배치(요소의 위치와 크기), 화면의 글자(문구와 크기), 물리 동작, 모델 파일(경로에 `model`이 든 파일)입니다.

| 규칙(`theme/patches/theme.mjs`) | 바뀌는 것 |
| --- | --- |
| `theme-font-family` | `PhetFont` 기본 글꼴 → `font.sans` + 한글 대체 |
| `theme-navigation-bar` | 아래 메뉴줄은 늘 밝은(흰) 모드, 글자색 → `phet.navigationBarText`. joist가 메뉴줄 색을 `'white'`/`'black'`과 직접 비교하므로 흰색은 PhET 흰색 그대로 둡니다 |
| `theme-home-screen-background` | 홈 화면 본문 배경 → `phet.homeScreenBackground`. 홈 화면 메뉴줄이 비교하는 `HomeScreen.BACKGROUND_COLOR`(검정)는 그대로 |
| `theme-push-button-base` | 기본 버튼 바탕(`ColorConstants.LIGHT_BLUE`) → `phet.pushButtonBase` |
| `theme-panel` | `Panel` 기본값(채움·테두리·모서리)만. 시뮬레이션이 직접 준 색은 그대로 |
| `theme-checkbox` | 체크박스 기본 색 |
| `theme-slider-thumb` | 슬라이더 손잡이 기본 색(PhET 파랑) → 강조색 |
| `theme-button-flat-rectangular`, `theme-button-flat-round` | 사각·둥근 버튼의 입체 전략(`ThreeDAppearanceStrategy` 계열)이 만드는 그라데이션 칠을 평평한 한 가지 칠로 바꿉니다(기본 칠·마우스를 올린 칠·누른 칠·투명). 입체감을 내는 겹은 노드 트리에 그대로 남아(노드를 더하거나 빼지 않음) 배치 검사(V12)가 같게 나오고, 색에서 만든 어두운 테두리는 옅은 토큰 선(`phet.buttonStroke`)이 됩니다. `RectangularButton.ts` 34·`RectangularButton.js` 8·`RectangularButtonView.js` 21(소문자 `threeD…` 3개 포함)과 둥근 버튼 같은 계열 모두 |
| `theme-button-flat-stroke`, `theme-button-flat-stroke-old` | `ButtonNode`의 평면 전략(콤보 상자 버튼 등이 씀)과 옛 계열 `*ButtonView`의 어두운 테두리 → 같은 옅은 선 |
| `theme-radio-selected-stroke` | 라디오 버튼 묶음의 선택 테두리(검정) → `phet.selectedStroke`, 선택 안 한 쪽 짙은 회색 → 옅은 선 |
| `theme-phet-color-scheme` | `RESET_ALL_BUTTON_BASE_COLOR`(주황) → `phet.resetAllButton`, `BUTTON_YELLOW` → `phet.zoomButton`(옛 5개는 이 값이 없음). `PhetColorScheme`의 물리 색은 그대로 |
| `theme-shaded-sphere-flat`, `theme-shaded-rectangle-flat` | `ShadedSphereNode`는 방사형 그라데이션 대신 `mainColor` 한 가지, `ShadedRectangle`은 모든 겹을 `baseColor`로 칠하고 겹은 그대로 둠 |
| `theme-accordion-box`, `theme-combo-box`, `theme-carousel`, `theme-carousel-button`, `theme-page-control`, `theme-expand-collapse-button`, `theme-arrow-button`, `theme-slider-track`(손잡이 테두리 포함), `theme-spectrum-slider`(막대 테두리와 커서 선만, 파장 색은 그대로), `theme-number-picker`, `theme-number-display`, `theme-probe-node` | 각 부품의 기본 색만(회색 칠·검정 테두리·순수 파랑 등 → 흰 카드·옅은 선·강조색). 모서리 반지름·두께·크기는 건드리지 않습니다 |

공통 층이 읽는 값은 `tokens.json`의 `phet` 역할(`buttonStroke`, `resetAllButton`, `zoomButton`, `componentFill`·`componentStroke`·`componentHighlight`·`componentText`·`componentAccent`·`componentMuted`, `selectedStroke`)입니다. 역할은 `color` 묶음 말고 `sim` 묶음의 키(`line`, `controlActive`, `control`)도 가리킬 수 있습니다(`PHET_ROLE_GROUPS`). 그래서 `sim` 토큰을 읽는 전체 규칙의 값은 시뮬레이션별 해시에 풀린 역할 값(`phetColors`)으로 들어가고, `sim.line`을 고치면 63개가 다시 빌드됩니다. 규칙마다 63개 고정 버전에서 적용 수를 `node theme/patches/dry-run.mjs`로 확인합니다(필수 규칙은 63/63, 옛 계열에 없는 부품만 선택 규칙).

자간(`tracking`)과 글자 크기는 시뮬레이션에 넣지 않습니다(캔버스 글자의 폭 계산이 달라져 배치가 바뀌므로). 시뮬레이션별로 더한 글자 크기는 없습니다.

## 학교 표기: 브랜드 `bsshs` (`brand/bsshs/`)

PhET의 `adapted-from-phet` 브랜드(MIT, `brand/bsshs/LICENSE`)에서 나왔습니다.
chipper의 브랜드 목록이 63개 고정 버전마다 코드에 박혀 있어서, 새 브랜드 폴더를 만들면 chipper를 버전마다 고쳐야 합니다.
그래서 **빌드할 때만** 임시 슬롯의 `brand/adapted-from-phet/` 안 파일을 `bsshs` 내용으로 바꿔 넣습니다. chipper·joist가 보는 브랜드 이름은 여전히 `adapted-from-phet`(PhET가 정한 제3자 빌드 경로, 갱신 확인·PhET 메뉴 항목이 이미 꺼져 있음)이고, 화면에 보이는 것은 모두 `bsshs`입니다.
실행 중 `Brand.id`도 `adapted-from-phet`로 둡니다(joist가 이 값으로 로고 정렬을 정함).

- `attribution.mjs` — 출처 문구 6개(그대로), 저장소 주소 `REPO_URL`(이 파일 한 곳), 워드마크 글자 `WORDMARK`.
  About 창: 이름 = `부산과학고 학생이 수정함`, 저작권 줄 = `원작: …`, License 칸 = PhET 출처 문장 · 라이선스 · `소스 코드: <REPO_URL>` · `부산과학고 학생 제작 · 학교 공식 자료 아님`. 학생 이름은 없습니다.
- `wordmark.mjs` — 「부산과학고」를 **글자로 그린** 로고 PNG 두 장(흰/검은 메뉴줄용, 높이 96px — joist가 로고를 PhET 로고 높이로 맞추므로)과 시작 화면 SVG(`<text>`).
  PNG는 설치된 Chrome에서 캔버스로 그리고 `$BSSHS_CACHE/bsshs-wordmark/`에 저장해 다시 씁니다(같은 컴퓨터에서는 같은 결과, 다른 컴퓨터는 기기 한글 글꼴에 따라 달라질 수 있음).
- `patches.mjs` — 브랜드 규칙: `Brand.{js,ts}` 필드, 로고 PNG와 로고 모듈의 data URI, `splash.svg`/`splash_svg.ts`, 이미지 저작권 기록(`license.json`), 옛 joist 두 계열의 "Adapted from" 글자 제거,
  ⋮ 메뉴 버튼의 화면 낭독용 이름 「부산과학고 메뉴」(`brand-menu-strings`: `joist-strings_en.json`의 `a11y.phetMenu`·`PhetButton.name`, `brand-menu-strings-ko`: babel 한국어 번역, `brand-menu-a11y-js`: 옛 계열의 `JoistA11yStrings.js`·`PhetButton.js`)와
  설정 창 문장 `preferences.tabs.general.moreAccessibility`의 "PhET website" 삭제. 두 문자열 배치(평평한 키 / 중첩 객체)를 모두 처리합니다.

## 외부 통신 끄기 (`theme/patches/telemetry.mjs`)

- `telemetry-google-analytics`: PhET 통계 스크립트(yotta 핑, Google Analytics/Tag Manager)를 빈 스크립트로 바꿈
- `telemetry-update-check`: 새 버전 확인 `areUpdatesChecked = false`
- `telemetry-yotta-default`: `?yotta` 기본값 false (옛 두 계열에는 이 항목이 없음)
- 글꼴은 HTML 안에 들어 있어 외부 요청이 없습니다. `check-sim`이 실제 요청을 모두 기록해 확인합니다.

## 패치 규칙의 모양 (invariant 9)

전체에 같은 글로 적용되는 패치는 `theme/patches/index.mjs`의 `ALL_RULES` 목록에 있는 규칙뿐이고, 종류는 `theme`·`brand`·`telemetry` 셋입니다(한국어 문자열 고치기 `terms`는 `theme/patches/terms.mjs`). 시뮬레이션 하나에만 적용되는 `sim-color`·`art` 규칙은 아래 「시뮬레이션 안쪽 디자인」에서 만들어집니다.
규칙 하나 = 저장소 하나 + 후보 파일 + (정규식 고치기 | 파일 통째 바꾸기) + 필수 여부 + 이유 한 줄.
63개 고정 버전의 파일이 제각각이라(예: `PhetButton` 29가지) 버전별 diff 대신 "PhET 원래 값을 찾아 토큰 값으로 바꾸는" 규칙으로 썼습니다. `node theme/patches/dry-run.mjs`가 git 미러에서 63개 버전 파일을 직접 읽어 규칙마다 적용 수와 파일 버전 수("SHA 계열")를 보여 줍니다.

- 항상 **커밋된 원본**(`git show HEAD:<파일>`)에 적용하므로 두 번 적용해도 결과가 같고, 빌드 뒤 `git checkout -- <파일>`로 되돌립니다(기존 overlay와 같은 방식). 행렬의 `trackedChangesAfterBuild`가 빈 배열이면 되돌리기가 확인된 것입니다.
- 후보 파일이 있는지는 git에 묻습니다(맥 파일 시스템은 대소문자를 구분하지 않아 `updateCheck.js`/`UpdateCheck.js`가 헷갈림).
- 필수 규칙이 맞지 않으면 빌드가 실패합니다(조용히 넘어가지 않음).

## 검사 도구 `tools/check-sim.mjs`

```
node tools/check-sim.mjs <sim.html | http(s)://주소> [--width 390] [--height N] [--timeout 10000] [--settle 2000]
                         [--shots <폴더>] [--no-about] [--quiet]
node tools/check-sim.mjs --refresh-logo-fingerprints
```

Playwright + 설치된 Google Chrome(`channel: 'chrome'`, headless). 끝 코드: 0 = 모두 통과, 1 = 하나라도 실패, 2 = 사용법·브라우저 오류.
헤드리스 Chrome은 창 폭 500px 아래로 배치하지 않으므로 `--width`가 600 미만이면 CDP 기기 화면 흉내(Playwright `viewport` = `Emulation.setDeviceMetricsOverride`, DPR 3, 터치)로 맞춥니다. 실제 폭은 `viewport.innerWidth`에 나옵니다.

검사 항목:

1. `ready` — `phet.joist.sim`과 화면이 생기고, 생성이 끝나고, 시작 화면이 사라질 때까지(기본 10초).
2. `errors` — 잡히지 않은 오류(`pageerror`)가 있으면 실패. 콘솔 오류는 기록만.
3. `wordmark` — 메뉴줄이 캔버스/SVG라 DOM 글자를 읽을 수 없어서, **장면 그래프(scenery)에서 보이는 그림 노드**를 직접 찾습니다.
   그림 바이트의 SHA-256이 빌드가 넣은 `<meta name="bsshs-wordmark-sha256">`와 같으면 통과(`scenery-image-sha256`).
   옛 RequireJS 계열(16개)은 chipper가 로고를 mipmap으로 다시 인코딩하므로, 같은 그림의 **픽셀**을 `<meta name="bsshs-wordmark-png">`와 비교합니다(`scenery-image-pixels`).
   DOM 표시만 확인하는 방식(브랜드가 넣는 표시)은 실제로 메뉴줄에 그려졌는지 증명하지 못해서 쓰지 않았습니다.
4. `phetLogo` — (가) HTML 안에 phetsims/brand의 모든 PhET 로고·시작 화면 파일(`tools/lib/phet-logo-fingerprints.json`, 49개)의 지문이 없어야 하고, (나) 화면에 보이는 그림 중 PhET 로고와 같은 것이 없어야 합니다.
   한계: 옛 RequireJS 계열은 로고가 다시 인코딩되어 (가)로 못 찾습니다. 그 계열은 로고 PNG 원본 파일 자체를 빌드 때 바꾸고, (3)이 로고 자리에 워드마크가 그려진 것을 확인합니다.
5. `about` — 워드마크 버튼을 실제로 눌러 메뉴를 열고 `개요`(About)를 눌러, 그때 새로 나타난 글자를 위→아래, 왼→오 순서로 이어 붙여(공백·방향 표시 문자 무시) 출처 문구 6개를 모두 찾습니다.
6. `network` — 모든 요청을 기록. file:// 페이지는 http(s)/ws 요청이 하나라도 있으면 실패, http(s) 페이지는 다른 origin이면 실패. data:/blob:은 내부로 셉니다.
7. `fonts` — 테마 빌드일 때만: 넣은 글꼴이 실제로 불러와졌는지(`document.fonts.check`).
8. `phetName` — 사용자나 화면 낭독기가 알 수 있는 곳에 "PhET"가 있으면 실패. 시작 직후, 메뉴를 연 때, About 창을 연 때 세 번 훑습니다:
   DOM의 모든 글자와 `aria-label`·`aria-roledescription`·`aria-valuetext`·`aria-description`·`title`·`alt`·`placeholder`(scenery의 PDOM은 보통 DOM),
   그리고 보이는 scenery 노드의 `accessibleName`·`labelContent`·`innerContent`·`descriptionContent`·`helpText`·`accessibleHelpText`·`accessibleParagraph`·`accessibleHeading`·`voicing*Response`.
   About 출처 문구 6개(줄바꿈으로 잘린 15자 이상 조각 포함)만 예외입니다.

`--shots <폴더>`: `<이름>-<폭>-home.png`(시작 직후), `-about.png`(About 창), `-screen1.png`(첫 실험 화면; 홈 화면이 있는 시뮬레이션만).

### check-sim JSON (schemaVersion 1)

T15가 확장합니다. 키를 지우거나 뜻을 바꾸지 말고 더하기만 하세요(바꾸면 `schemaVersion` 올리기).

```json
{
  "tool": "check-sim", "schemaVersion": 1, "target": "<인자>", "url": "<연 주소>",
  "viewport": { "requestedWidth": 390, "emulated": true, "innerWidth": 390, "innerHeight": 844 },
  "ok": true,
  "checks": {
    "ready":    { "ok": true, "ms": 420, "detail": null },
    "errors":   { "ok": true, "uncaught": [], "console": [] },
    "wordmark": { "ok": true, "method": "scenery-image-sha256|scenery-image-pixels", "expected": "부산과학고", "markerSha256": [], "visibleMatches": 1 },
    "phetLogo": { "ok": true, "staticHits": [], "displayedHits": [], "displayedImages": 11 },
    "about":    { "ok": true, "method": "menu-click|skipped", "opened": true, "missing": [], "detail": "(실패 때만)" },
    "network":  { "ok": true, "requests": [ { "url": "", "type": "document", "kind": "same-origin|external" } ], "external": [] },
    "fonts":    { "ok": true, "applicable": true, "families": [], "loaded": true, "readyBeforeSim": true },
    "phetName": { "ok": true, "method": "pdom-and-accessible-names", "scanned": 460, "hits": [ { "where": "dom-text <button>", "text": "(실패 때)" } ] }
  },
  "screenshots": []
}
```

치명적 오류(파일 없음, 브라우저 실행 실패)는 `{ "tool", "schemaVersion", "target", "ok": false, "fatal": "<메시지>" }` 한 줄입니다.

## HTML 삽입 (`theme/inject.mjs`)

빌드된 HTML의 `<meta charset>` 바로 뒤(문자 집합 선언이 처음 1024바이트 안에 남도록)에 `<!-- bsshs:begin … -->` ~ `<!-- bsshs:end -->` 묶음을 넣습니다:
`bsshs-brand`, `bsshs-wordmark-sha256`, `bsshs-wordmark-png` 메타(브랜드), `bsshs-theme` 메타·`<style id="bsshs-theme">`(OFL 주석 + `@font-face` + `--bsshs-*` 변수)·`<script id="bsshs-fonts">`(테마).
같은 파일에 다시 넣어도 결과가 같습니다. 이 묶음은 빌드 때 만들어지며 손으로 고친 값을 커밋하지 않습니다.

## 남은 PhET 표기 (확인한 것)

- 화면에 보이는 글자와 화면 낭독용 이름에서 PhET는 About 출처 문구에만 있습니다. 63개 모두 `check-sim`의 `phetName` 검사(시작 화면·메뉴·About 창)를 통과했습니다.
- ⋮ 메뉴 버튼 이름 "PhET Menu"(새 계열: `a11y.phetMenu`, 옛 계열: `JoistA11yStrings.js`, 아주 옛 계열: "PhET Menu Button")는 「부산과학고 메뉴」(아주 옛 계열의 `textDescription`은 「부산과학고 메뉴 버튼」)로 바꿨습니다. charges-and-fields·under-pressure에 남아 있던 "PhET Menu Button"은 아래 「용어 교정」의 규칙 합치기 수정으로 사라졌습니다.
- 63개 빌드의 문자열 표 전체를 훑어 "PhET"가 든 문자열을 모았습니다. 키보드 도움말·설정 창 문자열 중에는 설정 창 `moreAccessibility` 한 문장만 해당해서 고쳤습니다.
- 남겨 둔 것(이 브랜드에서는 화면·낭독기에 나오지 않음, `phetName` 검사로 확인):
  `menuItem.phetWebsite`("PhET 웹사이트", PhET 브랜드 전용 메뉴 항목), `donateToPhet`, `credits.thanks`(About의 제작진 칸은 PhET 브랜드에서만 보임),
  PhET-iO 설명 문자열(`phetioDocumentation` 등, PhET-iO 빌드에서만 쓰임), 소스 코드 주석·제3자 라이선스 목록, HTML 첫 줄 주석 `saved from url=(0026)https://phet.colorado.edu/`(IE용 표시).
- `check-sim`은 설정 창·키보드 도움말 창을 열지 않습니다. 이 두 창의 색은 `check-style`(V11)이 열어서 봅니다.

## 시뮬레이션 안쪽 디자인

사양 3.1에 따라 시뮬레이션 안쪽의 색과 그림도 토큰으로 옮깁니다. 값은 `theme/tokens.json`의 `sim` 묶음에만 있고, 시뮬레이션별 파일에는 값이 아니라 **토큰 경로**를 적습니다(`tests/theme/no-literals.test.mjs`가 `theme/` 아래 json·svg도 훑습니다).

### 색 글자 하나를 토큰으로: `theme/sim-styles/<id>.json`

```json
{
  "colors": [
    { "repo": "faradays-law", "file": "js/faradays-law/view/MagnetNode.js",
      "find": "new Color\\( ('[^']*') \\)", "occurrence": 2, "to": "sim.physics.magnetS" }
  ],
  "canvasNodes": [ "WaveCanvasNode" ],
  "exceptions": [ { "kind": "fill", "node": "SpectrumNode", "reason": "파장에서 정해지는 색", "approvedBy": "대조표 승인" } ]
}
```

- `colors`가 빌드를 바꿉니다. `find`는 정규식 **글**이라서 색 값을 파일에 쓰지 않아도 됩니다. 괄호 묶음(1번)이 있으면 그 부분이, 없으면 매치 전체가 바꿀 글자입니다. `occurrence`는 이 `find`의 매치가 파일 안에서 몇 번째인지(1부터)입니다. `to`는 `color.*` 또는 `sim.*` 경로입니다.
- 규칙은 **색 글자 문법에 맞는 글자만** 바꿉니다: `Color.이름`, 따옴표 안의 `#16진수`·`rgb()`·`rgba()`·`hsl()`, `new Color(숫자들 / 따옴표 글자 / 0x16진수)`, CSS 색 이름 문자열. 그 밖의 글자가 걸리면 빌드가 멈춥니다. `Color.TRANSPARENT`와 `'transparent'`는 바꾸지 않습니다.
- `Color.이름`은 `new Color( "토큰 색" )`으로 바뀌어서 뒤에 붙은 `.withAlpha( … )`가 그대로 동작합니다. 파일에 값으로 쓸 수 있는 `Color` 가져오기가 없으면 멈춥니다. 투명도가 1보다 작은 글자를 불투명 토큰으로 바꾸면 투명도는 유지됩니다.
- 각 바꿈은 따로 한 번 더 적용해서 글자 비교(앞뒤 글자가 같은지)로 확인합니다. 해당 글자 밖이 바뀌면 멈춥니다.
- 경로에 `model/`이 든 파일은 규칙을 만들 때와 패치 허용 목록(V10b) 두 곳에서 거절합니다. 모델 파일 안의 색은 `exceptions`에 적습니다.
- `canvasNodes`, `exceptions`는 `check-style`(V11)이 읽습니다. 빌드 해시에는 들어가지 않습니다.
  - `canvasNodes`: 장면 그래프 밖(캔버스·WebGL)에서 그려지는 노드의 클래스 이름. 이름에 들어 있지 않은 캔버스 노드가 화면에 있으면 지적합니다. 이 노드의 색은 화면 픽셀 검사로만 봅니다.
  - `exceptions`: 항목마다 `kind`(`fill`·`stroke`·`gradient`·`image`·`pixels`·`contrast`·`canvas`), `reason`, `approvedBy`가 있어야 하고, 좁히는 칸 `screen`(홈 화면은 -1)·`dialog`(`keyboardHelp`·`preferences`)·`node`(클래스 이름)·`color`(`r,g,b`)는 선택입니다. `approvedBy`가 비었으면 그 예외는 아무것도 면제하지 않고 검사가 실패합니다. 시뮬레이션당 `sim.check.maxExceptions`건(20)을 넘으면 실패합니다. 스펙트럼·파장 색은 여기서 다룹니다.
- 지금 `theme/sim-styles/`에는 `faradays-law.json`(색 31개), `circuit-construction-kit-dc.json`(색 108개: `circuit-construction-kit-common`과 `scenery-phet`의 글자, 예외 9건), `bsshs-photoelectric.json`(`canvasNodes`와 파장 색 예외 3건)이 있습니다. 파일이 없는 시뮬레이션은 공통 규칙만 받습니다.
- 공유 저장소(`circuit-construction-kit-common`)의 색 규칙도 **그 시뮬레이션의 빌드 슬롯에서만** 적용됩니다. 규칙은 시뮬레이션별 파일이 만들고 해시도 시뮬레이션별이라, 같은 저장소를 쓰는 다른 CCK 시뮬레이션(`-ac`, `-virtual-lab`)은 자기 `sim-styles` 파일이 생길 때까지 색이 그대로입니다. 반대로 그림은 `art/map.json`이 저장소와 파일 이름으로 정하므로, 그림이 들어 있는 모든 시뮬레이션이 같은 새 그림을 받습니다.
- 한계: 색 글자 문법 밖의 칠은 규칙으로 못 바꿉니다. 색을 계산하는 식(`backgroundColor.colorUtilsDarker( … )`)과 그라데이션 구조는 그대로라서 `exceptions`에 올립니다. 이미 토큰과 같은 값인 글자(예: `'#ffffff'` → `sim.surface`)는 앞뒤가 같아서 "바뀐 곳이 없다"는 가드에 걸리므로 항목에 쓰지 않습니다.

### 그림 파일을 평면 그림으로: `theme/art/map.json`

```json
{ "entries": [ { "repo": "scenery-phet", "files": [ "images/eraser.png" ], "svg": "scenery-phet/eraser.svg", "size": "70x57" } ] }
```

- 항목 하나 = 그림 한 장. `files`는 고정 버전마다 다른 파일 이름들(예: `light-bulb-base.png`, `lightBulbBase.png`), `svg`는 `theme/art/` 아래 SVG, `size`(선택)는 이 크기의 PNG인 고정 버전에만 적용한다는 뜻입니다.
- SVG는 `width`·`height`에 픽셀 크기를 적고, 색은 `{{sim.physics.copper}}`처럼 토큰 자리표시자로 씁니다. 토큰을 고치면 그림도 따라옵니다.
- 빌드는 고정 버전의 저장소에 실제로 있는 파일만 바꿉니다. 같은 파일 이름이 있는데 맞는 항목이 없으면(다른 크기) 조용히 넘기지 않고 멈춥니다.
- **크기 검사**: 그린 그림의 픽셀 크기가 원본 PNG와 다르면 빌드가 실패합니다(`CoilNode`의 `scale`, `LaserNode`의 `scale`, 도선 끝점처럼 코드가 그림 크기에 기대기 때문). 준비할 때 한 번, 규칙이 실제 파일을 만날 때 한 번 더 확인합니다.
- 바꾸는 파일: `*.png`, 그 옆에 커밋된 모듈(`*_png.js`, `*_png.ts`, 밉맵 모듈 포함), 같은 폴더의 `license.json`. 밉맵은 원래 모듈과 같은 단계 수를 chipper의 `mipmapDownscale`과 같은 계산(감마 2.2, 투명도 가중)으로 다시 만듭니다. 모든 단계는 PNG로 씁니다. 모듈 모양을 모르면 추측하지 않고 멈춥니다.
- 옛 RequireJS 계열(5개: charges-and-fields, pendulum-lab, plinko-probability, projectile-motion, under-pressure)은 커밋된 모듈이 없고 빌드의 그림 도구가 PNG를 읽습니다. 그래서 PNG와 `license.json`만 바뀝니다.
- `license.json`에는 새 그림을 「이 프로젝트 기여자들의 새 저작물, GPL-3.0」으로 적습니다(원본 PhET 기록을 새 그림에 남기지 않음). `license.json`이 없는 폴더의 그림은 바꾸지 않고 멈춥니다. `.jpg`·`.svg` 원본은 바꾸지 않습니다.
- SVG를 PNG로 바꾸는 일은 설치된 Chrome(Playwright)이 합니다. 결과 픽셀은 `$BSSHS_CACHE/bsshs-art/`에 SVG 글·크기·렌더러 버전의 해시로 저장해 다시 씁니다. PNG 파일은 같은 픽셀에서 항상 같은 바이트가 되도록 직접 인코딩합니다.
- 지금 `theme/art/map.json`에는 32개 항목이 있습니다: `faradays-law` 코일 4장, `scenery-phet` 전구 밑동 1장(89×71은 63개 고정 버전 모두 같음), `circuit-construction-kit-common` 26장(전지·저항기·전구·도선·전류계·전압계·탐침·퓨즈·생활용품 등), `circuit-construction-kit-dc` 실험 화면 아이콘 1장. SVG는 원본 크기 그대로, 코일은 도선 끝점(`CoilNode`가 고정 좌표로 이음)이 원본과 같은 자리에 오도록 나선 식으로 그렸습니다.

### 빌드 해시는 시뮬레이션마다

이어 하기(`themeHash`)는 시뮬레이션마다 따로 계산합니다(`variantHash(tokens, opts, simId, simInput)`, `simVariantHash`). 들어가는 것:

- 전체 규칙의 글: 규칙 id·후보 파일·찾는 패턴·**바꾸는 코드**(`replace`/`content` 함수 글)와, 그 코드가 읽는 값(`sim` 묶음을 뺀 토큰, 브랜드 필드)
- 그 시뮬레이션의 `theme/sim-styles/<id>.json` `colors` (`to`를 토큰의 지금 값으로 풀어서)
- 그 시뮬레이션의 고정 버전 저장소에 실제로 있는 파일에 대응하는 `theme/art` 항목의 SVG 글(자리표시자를 푼 것)
- 새 시뮬레이션(`sims/`)은 소스가 토큰 모듈을 가져다 쓰도록 만들 수 있으므로 `sim` 묶음 전체

그래서 한 시뮬레이션의 색 파일이나 그림을 고치면 그 시뮬레이션만 다시 빌드되고, `sim.physics.copper`를 고치면 그 토큰을 쓰는 시뮬레이션만 다시 빌드됩니다. 전체 규칙이나 `sim` 밖 토큰을 고치면 68개가 모두 다시 빌드됩니다. 빌드 기록의 `themeHash`가 이 값이고, V1이 같은 계산으로 맞춰 봅니다.

### 규칙 종류와 허용 목록

종류는 `theme`·`brand`·`telemetry`·`terms`에 더해 `sim-color`·`art`입니다. `tools/lib/verify-core.mjs`의 `PATCH_ALLOWLIST`:

- `sim-color`: `babel`·`chipper`·`perennial-alias`·`brand`가 아닌 저장소의 `js/` 아래 `.js`·`.ts`
- `art`: 같은 저장소 조건에서 `images/`·`mipmaps/` 아래 `*.png`, `*_png.js`, `*_png.ts`, `license.json`
- 모든 종류에 `PATCH_DENY`가 적용됩니다: 경로에 `model/`이 든 파일은 어떤 규칙도 건드리지 못합니다.

### 조사 도구: `theme/patches/color-inventory.mjs`

```sh
node theme/patches/color-inventory.mjs <시뮬레이션 id> [--repos a,b] [--all-libs] [--json]
```

고정 버전의 시뮬레이션 저장소와 그 시뮬레이션 전용 공통 저장소(공유 라이브러리는 뺌)에서 색 글자를 모두 찾아, 파일·줄·`occurrence`(일반 색 문법 `COLOR_SCAN_SOURCE`로 센 번호)·글자·모델 경로 여부·이미 `sim-styles`에 연결됐는지를 줄마다 보여 줍니다. 마지막 줄에 연결 안 된 개수(고칠 수 있는 것, 모델 경로라 예외로만 남길 수 있는 것, 문법이 못 바꾸는 것)를 셉니다. `--json`의 `suggest`에는 줄 앞쪽 글을 붙인 `find`와 그 `find`로 센 `occurrence`가 들어 있어 그대로 `sim-styles`에 옮길 수 있습니다. git 미러에서 읽기만 하며 체크아웃하지 않습니다.

### 검사 도구 `tools/check-style.mjs` (V11)

```sh
node tools/check-style.mjs <빌드 html> [--id <id>] [--width 1280] [--settle 800] [--no-dialogs] [--styles-dir <폴더>]
```

시뮬레이션을 반복 가능한 시간 흐름으로 열고(난수 고정, 가상 시계, 건물이 다 지어진 뒤 정해진 프레임 수에서 시뮬레이션 시계 정지), 홈 화면과 모든 화면을 `compare-layout`과 같은 방법으로 돕니다. 내비게이션 줄에 버튼이 있으면 키보드 도움말 창(화면마다)과 설정 창(한 번)도 엽니다. 창의 노드는 열려 있는 동안만 장면 그래프에 보이므로 그때 훑습니다. 시계를 멈춘 동안 조이스트는 입력을 끄므로(`display.interactive`) 창을 열기 전에 입력만 다시 켭니다(모델은 계속 멈춰 있음).
보는 것은 세 가지입니다.

1. 장면 그래프: 보이는 노드의 칠·선 색이 팔레트 밖(`fill`·`stroke`), 그라데이션·패턴(`gradient`), 원본 그림과 같은 그림(`image`: 바이트 SHA-256 또는 픽셀 해시가 고정 버전 저장소의 PNG와 같음, 밉맵 단계 포함), 선언하지 않은 캔버스 노드(`canvas`). 투명도가 1보다 작은 색은 불투명 토큰으로 인정하지만, 불투명 검정이 투명 검정 토큰(`color.border`)에 가려지지는 않습니다.
2. 화면 픽셀: 팔레트 밖 색의 비율이 `sim.check.outsideShareMax`를 넘으면 `pixels`. 팔레트 색이거나 팔레트 색 둘을 잇는 선 위의 색(가장자리 흐림, 부드러운 그림자)은 안으로 셉니다. 투명한 팔레트 색은 캔버스·카드 위에 올린 색으로 셉니다.
3. 글자 대비: 보이는 글자 노드의 칠과 그 글자 상자 안 픽셀 중 글자색이 아닌 가장 흔한 색의 대비가 `sim.check.minContrast` 미만이면 `contrast`. 창 보기에서는 창이 새로 더한 글자만 셉니다.

설정에 맞는 예외는 `excepted`로, 나머지는 `openFindings`로 나오며 끝 코드가 0이려면 `openFindings`와 `problems`가 모두 비어야 합니다. 출력은 한국어 한 줄 뒤에 JSON 한 줄(schemaVersion 1)입니다. 한계: 클래스 이름은 빌드에서 뭉개지므로 이름은 PhET 이름공간(`phet.scenery.Path`, `phet.faradaysLaw.MagnetNode`)에서 거꾸로 찾습니다. 이름공간에 등록되지 않은 클래스는 `anonymous`입니다. 실행 중 상호작용으로만 나타나는 색은 못 봅니다.

### 검사 도구 `tools/compare-bounds.mjs` (V12)

```sh
node tools/compare-bounds.mjs --freeze [--force]      # 지금 빌드 68개를 고정본으로 복사 (이미 있으면 --force 없이는 거부)
node tools/compare-bounds.mjs <id> [--current f] [--baseline f]
node tools/compare-bounds.mjs --all [--jobs 4]
```

고정본은 `$BSSHS_CACHE/layout-baseline/<id>/<id>_ko.html`과 `baseline.json`(고정한 때, 그때의 커밋, 파일마다 크기·SHA-256)입니다. 임시 폴더에 다 복사한 뒤 한 번에 바꿔 끼우므로 중간에 멈춰도 반쪽 고정본이 남지 않습니다.
비교는 고정본과 지금 빌드를 같은 반복 가능한 시간 흐름으로 열어(첫 측정 전에 이미 고정) 모든 화면에서 **자기 모양이 있는 노드**(선 두께를 뺀 도형, 글자 상자, 그림 상자)의 전역 상자를 비교합니다. 컨테이너는 비교하지 않습니다(선 두께가 바뀌면 모든 조상이 따라 바뀌기 때문). 노드는 자식 번호 경로와 이름공간 이름으로 짝지으며, 위치·크기가 `sim.check.boundsTolerance`(0.5px)보다 다르면 `changed`, 한쪽에만 있으면 `missing`/`added`, 보임 여부가 다르면 `visibility`로 시뮬레이션별로 나옵니다. 아무 노드도 비교하지 못하면 실패입니다. `--nondeterministic`은 진단용으로 반복 가능한 시간 흐름을 끕니다.

### 검토 대조표 `tools/style-review.mjs`

```sh
node tools/style-review.mjs [--sims id,id | --all] [--out build/style-review]
```

`build/style-review/index.html`과 `img/` 폴더를 만듭니다. 시뮬레이션마다 화면별로 이전(고정본)과 이후(지금 빌드) 스크린샷을 나란히 놓고, V11 결과(열린 지적, 예외, 팔레트 밖 픽셀 비율이 가장 큰 화면, 가장 낮은 글자 대비)와 V12 결과(다른 노드 수)를 위에 모읍니다. 그림은 상대 경로 파일이라 `file://`로 바로 열립니다. 기본 대상은 `data/style-done.json`의 시뮬레이션이고 목록이 비어 있으면 `--sims`나 `--all`로 고릅니다.

## 서랍 키 (drawer keys)

수업 서랍([drawer.md](drawer.md))의 크기·기준 폭·움직임 값도 이 파일에만 있습니다. `drawer/config.mjs`는 값을 갖지 않고 여기서 읽기만 하며, 형식이 틀리면 주입이 멈춥니다. 시뮬레이션 안에는 쓰이지 않습니다.

| 키 | 뜻 |
| --- | --- |
| `font.sizes.largeScreenBody` | 큰 화면(`breakpoint.large` 이상)의 서랍 본문 글자 크기. 기본 18px(바꿔도 되는 기본값) |
| `size.touchTarget` | 누르는 곳의 최소 크기(가로·세로). 기본 44px(바꿔도 되는 기본값) |
| `size.hairline` / `size.strongBorder` | 얇은 테두리 / 굵은 테두리·포커스 테두리 두께 |
| `breakpoint.sheet` | 이 폭 이하면 서랍이 아래 시트(휴대폰). 기본 600px |
| `breakpoint.large` | 이 폭 이상이면 큰 화면(교실 칠판) 글자. 기본 1600px |
| `drawer.width` / `drawer.widthLarge` | 옆 서랍 폭 / 큰 화면의 옆 서랍 폭(화면보다 넓어지지 않음) |
| `drawer.sheetHeight` | 아래 시트 높이 |
| `drawer.motion` | 서랍이 나오는 시간(움직임 줄이기 설정이면 0) |
| `drawer.zIndex` | 서랍이 시뮬레이션 위에 오는 층 순서 |
| `drawer.liveRefresh` | 서랍이 열려 있을 때 「현재 값」을 새로 읽는 간격 |

이 키들을 더하면서 토큰 해시(`themeHash`)가 바뀌었으므로, 이어서 빌드하면 학교판이 다시 빌드됩니다.
- `drawer.sheetMinHeight` (40vh): 휴대폰 아래 시트의 최소 높이. 시트 위로 시뮬레이션이 계속 보이게 합니다.
- `drawer.graph.labelMaxLines` (3): 그래프 아래 맞춤 글(기울기·절편)의 최대 줄 수. 넘치면 잘리지 않게 줄을 바꿉니다.

## 용어 교정

학교판(`--brand bsshs`)의 한국어 화면 글자 중 **뚜렷한 오역**과 **수업 용어와 어긋난 표현**만 고칩니다. 문장을 다듬는 일은 하지 않습니다.
(예: 콘덴서→축전기, 푸우리에→푸리에, 죤 트라볼티지→존 트라볼티지, 파라데이→패러데이.)

### 파일

| 파일 | 내용 |
| --- | --- |
| `data/term-fixes.json` | 고친 목록 전체. `{ "global": [...], "perSim": { "<시뮬레이션 id>": [...] } }`, 항목은 `{ "from": "<원래 한국어>", "to": "<고친 말>", "reason": "오역 \| 수업 용어 \| 표기" }` |
| `data/titles.json` | 63개 시뮬레이션의 고친 한국어 제목 `{ "<id>": "<제목>" }`. 목록 사이트가 읽습니다. 제목은 번역 원본 제목에 위 고침을 적용한 값과 같아야 하며 테스트가 확인합니다. |
| `theme/patches/terms.mjs` | 고침을 빌드 때 적용하는 코드 |
| `tools/lib/ko-strings.mjs` | 고정된 번역 원본(babel)에서 한국어 문자열 표를 읽는 도구(체크아웃 없이 git 미러에서) |
| `tests/terms/` | 검사: 모양, 쓸모없는 고침 없음, 제목, 빌드 결과 |

### 적용 방식

- 빌드할 때 다른 패치와 똑같이 임시 체크아웃의 `babel/<저장소>/<저장소>-strings_ko.json` 값을 바꾸고 빌드가 끝나면 되돌립니다. 영어 원문·키·코드는 그대로입니다.
- 일반 빌드(플래그 없음)와 `--theme`만 쓴 빌드에는 적용하지 않습니다. `--brand bsshs`일 때만 적용합니다.
- 한 시뮬레이션에는 그 시뮬레이션의 `perSim` 목록을 먼저, 이어서 `global` 목록을 파일에 적힌 순서대로 적용합니다. `from`은 문자열 값 안의 모든 부분 일치를 바꿉니다.
- `global`에는 어느 시뮬레이션·어느 문자열에서도 안전한 것(오타, 고유 명사 표기)만 넣습니다. 문맥에 따라 달라지는 것은 `perSim`에 넣습니다. 번역 파일을 공유하는 시뮬레이션(예: gas-properties·diffusion·gases-intro)은 각각 적습니다.
- 고침 목록이 바뀌면 테마 해시가 바뀌어서, 이어서 빌드할 때도 다시 빌드합니다.
- 영어 키가 없는 한국어 문자열(번역 저장소에만 남은 옛 항목)은 빌드에 실리지 않으므로 고치지 않았습니다.

### 새 고침 넣기

1. 고칠 문자열이 진짜 쓰이는지 확인합니다. 영어 파일에 같은 키가 있어야 하며, `tests/terms/helpers.mjs`의 `loadPinnedTables()`가 이 표(`live` 표시)를 읽어 줍니다.
2. `data/term-fixes.json`에 `{ from, to, reason }`을 넣습니다. `from`이 너무 짧아서 다른 문자열까지 바꾸지 않는지 확인합니다.
3. 제목이 바뀌면 `data/titles.json`도 같이 고칩니다.
4. `node --test tests/terms/*.test.mjs`, 그리고 해당 시뮬레이션을 `node tools/build-sim.mjs <id> --brand bsshs --theme --force`로 다시 빌드한 뒤 같은 테스트를 한 번 더 돌립니다(빌드 결과 검사는 `build/bsshs-theme/`에 파일이 있을 때만 돕니다).

### 이번에 기록한 고침

- 서로 다른 고침 91개(`global` 26개 + 시뮬레이션별 목록에 풀어 적은 항목 111개 = 항목 137개). 이유별: 오역·수업 용어·표기.
- 수업 용어는 `data/lessons/*.json`의 용어를 따랐습니다: 축전기, 전하(하전→전하), 패러데이, 광축·실상·허상·곡률반지름, 회절, 편광, 들뜬상태, 고전, 속도(velocity), 드브로이 등.
- 고치지 않고 남긴 모호한 것은 작업 보고서의 「concerns」에 적었습니다.

### 규칙 합치기 수정

같은 파일(joist `js/PhetButton.js`)을 가리키는 규칙 둘(`brand-menu-a11y-js`, `brand-no-adapted-from-text`)이 있으면 뒤 규칙이 다시 원본에서 시작해서 앞 규칙의 결과를 덮어썼습니다. 그래서 charges-and-fields·under-pressure에 `textDescription:"PhET Menu Button"`이 남았습니다.
`applyPatchRules` 한 번 안에서는 같은 파일에 대한 뒤 규칙이 앞 규칙이 쓴 내용 위에서 이어지도록 고쳤고(`tests/terms/compose.test.mjs`), 이 글자는 「부산과학고 메뉴 버튼」으로 바뀝니다.
