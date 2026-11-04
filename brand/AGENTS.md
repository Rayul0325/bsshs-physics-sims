# brand/ — 학교 표기 `bsshs`

## 맡는 것

- `bsshs/attribution.mjs`: 출처 문구 6개(`ATTRIBUTION`), 저장소 주소 `REPO_URL`(프로젝트에서 이 한 곳), 워드마크 글자 `WORDMARK = '부산과학고'`, `BRAND_ID`, About 창에 넣을 Brand 필드(`brandFields()`), 검사기가 찾을 문구 목록(`REQUIRED_ABOUT_STRINGS`).
- `bsshs/wordmark.mjs`: 「부산과학고」를 글자로 그린 메뉴줄 로고 PNG 두 장(흰/검은 메뉴줄용, 높이 96px)과 시작 화면 SVG(273×130, `<text>`). PNG는 설치된 Chrome 캔버스에서 토큰의 한글 글꼴 목록으로 그리고 `$BSSHS_CACHE/bsshs-wordmark/`에 입력 해시별로 저장해 다시 쓴다.
- `bsshs/patches.mjs`: 브랜드 규칙(`BRAND_RULES`): Brand 필드, 로고 PNG와 로고 모듈의 data URI, 시작 화면, 이미지 라이선스 기록, 옛 joist의 "Adapted from" 글자 제거, ⋮ 메뉴 버튼 이름 「부산과학고 메뉴」(아주 옛 계열 `textDescription`은 「부산과학고 메뉴 버튼」), 설정 창 문장의 "PhET website" 삭제.
- `bsshs/LICENSE`: PhET `adapted-from-phet` 브랜드에서 온 MIT 라이선스.

## 맡지 않는 것

- 규칙 적용·되돌리기는 `theme/patches/engine.mjs`, 규칙 목록 합치기는 `theme/patches/index.mjs`다.
- 색·글꼴·글자 크기 값은 `theme/tokens.json`(`font.sizes.wordmark`, `font.sizes.splash`, `font.wordmarkWeight`, `phet.wordmarkOnWhite` 등)에서 읽는다. 여기에 값을 쓰지 않는다.
- 사이트 바닥 문구 배치는 `site/`가 이 모듈의 문구를 가져다 쓴다.
- PhET의 `brand/` 저장소 자체를 고치지 않는다. 빌드 슬롯의 `brand/adapted-from-phet/` 안 파일만 빌드 동안 바꾼다.

## 지켜야 할 것

- `ATTRIBUTION`의 6개 문구는 글자 하나도 바꾸지 않는다. 검사기(`check-sim`의 About 검사)와 사이트 테스트가 이 문구를 그대로 찾는다.
- 학생 이름, 선생님 이름, 교표 그림을 넣지 않는다. 학교 표시는 글자 로고뿐이다.
- 실행 중 `Brand.id`는 `adapted-from-phet` 그대로 둔다(joist가 이 값으로 로고 정렬을 정한다). 브랜드 이름을 `bsshs`로 바꾸면 chipper가 브랜드를 거부한다.
- 로고 PNG 높이는 96px(PhET 로고 이미지와 같은 높이)이어야 한다. joist가 로고를 PhET 로고 높이로 늘이거나 줄인다.
- `REPO_URL`이나 출처 문구를 바꾸면 `brandFields()`가 바뀌어 `variantHash`가 바뀌고 68개가 다시 빌드된다.
- 메뉴 버튼 이름 규칙은 새 계열(`joist-strings_en.json`의 `a11y.phetMenu`·`PhetButton.name`, babel 한국어 번역)과 옛 계열(`JoistA11yStrings.js`·`PhetButton.js`)을 모두 처리해야 한다. 두 문자열 배치(평평한 키 / 중첩 객체)를 모두 처리한다.
- `brand-menu-a11y-js`와 `brand-no-adapted-from-text`는 같은 파일(`joist/js/PhetButton.js`)을 고친다. 둘이 한 번의 적용 안에서 순서대로 이어져야 앞 규칙 결과가 남는다.

## 작업 방식

- 워드마크 렌더 방식(크기, 여백, 그리는 코드)을 바꾸면 `RENDER_VERSION`을 올려 캐시를 무효화하고, `themeHash`에 잡히지 않으므로 `--force`로 다시 빌드한다.
- 다른 컴퓨터에서는 그 컴퓨터의 한글 글꼴로 PNG가 다시 그려진다. 바이트 재현이 필요하면 같은 캐시를 쓴다.

## 테스트

- `tests/theme/attribution.test.mjs`: 6개 문구, Brand 필드 모양.
- `tests/theme/patches.test.mjs`: 브랜드 규칙의 단위 변환(두 문자열 배치, 옛 계열 파일).
- `tests/terms/compose.test.mjs`: 같은 파일 규칙 합성("PhET Menu Button"이 남지 않음).
- 실제 빌드에서는 `check-sim`의 `wordmark`(장면 그래프의 그림 지문, 옛 RequireJS 16개는 픽셀 비교), `phetLogo`, `about`, `phetName`이 이 모듈의 결과를 검사한다. 규칙을 바꾸면 63개 학교판을 다시 빌드하고 V2를 돌린다.
