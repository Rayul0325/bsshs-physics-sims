# 규칙


## PhET 소스와 패치

- PhET 소스는 빌드 슬롯의 임시 체크아웃에서만 바뀐다. 저장소에 PhET 소스를 커밋하지 않고, 슬롯 밖에서 PhET 파일을 고치지 않는다.
- 소스 변경은 `theme/patches/index.mjs`의 `ALL_RULES`에 있는 규칙과 용어 교정 규칙뿐이다. 규칙의 종류는 `theme`·`brand`·`telemetry`·`terms` 넷이다. 다른 목적(물리 계산, 화면 배치, 시뮬레이션별 모델 코드)의 규칙을 만들지 않는다.
- 종류별로 건드려도 되는 파일은 `tools/lib/verify-core.mjs`의 `PATCH_ALLOWLIST`가 정한다. 이 목록은 규칙 목록과 따로 관리한다. 새 규칙이 허용 목록 밖 파일을 후보로 적거나 실제로 고치면 V10b가 실패한다. 허용 목록을 넓혀 통과시키지 않는다. 넓혀야 한다면 그 자체가 사용자 확인 대상이다.
- 규칙은 정규식 고치기 또는 파일 통째 바꾸기이며, 커밋된 원본(`git show HEAD:<파일>`)에 적용한다. 필수 규칙(`required: true`)이 맞는 곳을 못 찾으면 빌드가 실패해야 한다. 맞지 않는 규칙을 선택으로 바꿔 조용히 넘기지 않는다.
- 빌드 뒤 모든 형제 저장소가 깨끗해야 한다(빌드 기록의 `trackedChangesAfterBuild`가 빈 배열). 비어 있지 않으면 V10b가 실패한다.
- 빌드 설정 덧대기는 두 가지뿐이다: `package.json`의 `supportedBrands`에 `adapted-from-phet` 한 줄, CCK AC 두 시뮬레이션의 `chipper-skip-tsc`. 세 번째 덧대기를 더하면 V10b가 실패한다.
- 비공개 PhET-iO 저장소를 흉내 낸 가짜 파일을 만들지 않는다.

## 고정 버전

- 버전은 `data/sims.json`과 그 브랜치의 `dependencies.json` SHA, 매니페스트의 `babelSha`로 고정된다. 빌드가 안 된다고 다른 브랜치·SHA로 바꾸지 않는다. 사용자에게 보고한다.
- 새 시뮬레이션은 `newSimBase` 부품 묶음으로만 빌드한다. 빌드 도구가 슬롯의 모든 부품 SHA를 확인하고(`slotShasMatchBase`), 다르면 빌드하지 않는다. `phet.phetLibs`에는 `newSimBase` 묶음에 있는 저장소만 적을 수 있다.

## 디자인 값

- 색(16진, `rgb()`류), 값이 적힌 `font-family`, 토큰의 글꼴 이름, 서랍 치수(폭, 기준 폭, 터치 크기, 시간, 층 순서)는 `theme/tokens.json`에만 쓴다. `theme/`, `brand/`, `tools/`, `drawer/`, `adapters/`, `site/`, `sims/`의 코드에 쓰면 테스트(`tests/theme/no-literals.test.mjs`, `tests/drawer/literals.test.mjs`, `tests/new-sims/sources.test.mjs`)가 실패한다. PhET 원래 값을 **찾는** 패턴은 정규식으로 적어 검사를 피한다.
- 색 토큰은 PhET `Color`가 읽는 `#rgb`·`#rrggbb`·`rgb()`·`rgba()`만 쓴다(oklch 불가). `loadTokens()`가 거부한다.
- 서랍 CSS와 사이트 CSS는 `__이름__` 자리표시자와 `--bsshs-*`·`--site-*` 변수로만 값을 받는다. `drawer.css`에 모르는 자리표시자를 쓰면 주입이 멈춘다. `drawer.graph`에 모르는 키를 더하면 주입이 멈춘다.
- 시뮬레이션 안에는 자간과 글자 크기를 넣지 않는다(캔버스 글자 폭이 바뀌어 배치가 달라진다).
- 물리적 의미가 있는 시뮬레이션별 색(전자, 자기력선, 광자)은 바꾸지 않는다. 새 시뮬레이션의 광자 색은 파장에서 계산한다(`VisibleColor.wavelengthToColor`).

## 실험 화면 배치

- 서랍을 닫은 시험 범위 시뮬레이션은 서랍 없는 학교판 빌드와 열기 버튼 상자 밖에서 픽셀이 같아야 한다(1280·390, 모든 화면, V9, 다른 픽셀 허용 0). 열기 버튼에는 그림자를 두지 않는다(비교에서 빼는 것은 버튼 상자와 둘레 1 장치 픽셀뿐이다).
- 서랍 코드는 `Math.random`을 쓰지 않는다(V9가 두 파일의 난수를 같은 시드로 맞춘다).
- 서랍은 빌드가 끝난 HTML의 `</body>` 바로 앞 `<!-- bsshs-drawer:begin -->` 묶음으로만 들어간다. V1이 검사하는 `build/bsshs-theme/` 파일에는 서랍이 없어야 한다.

## 시험 범위 시뮬레이션 파일

- `adapters/<id>/drawer.json`: 최상위 키는 `simId`(폴더 id와 같음), `schemaVersion`(1 이상 정수), `measurements`, `graphs`뿐. 측정 항목 키는 camelCase이고 겹치지 않으며, 이름은 한국어, `unit`은 문자열(없으면 `""`), `classUnit`은 `unit`·`factor`(0 아님)·`offset`(선택)만, `classUnit.unit`은 `unit`과 달라야 한다. 그래프는 2개 이상, id는 kebab-case이며 `free`가 아니고, 제목은 한국어, `x`·`y`는 측정 키, `fit`은 `"linear"` 또는 `null`. 어기면 주입이 실패한다.
- `adapters/<id>/adapter.mjs`: `import`(정적·동적 모두) 금지, `bsshsDrawer.register({...})`를 한 번 부른다. `read()`는 `drawer.json`의 모든 키를 화면 단위 숫자 또는 `null`로 돌려준다.
- `adapters/<id>/cases.json`: 배열, 사례마다 `name`·`params`·`expect`뿐, `expect`의 키는 측정 키이고 값은 `value`(숫자)와 선택적 `relTol`(0 이상)뿐.
- 시험 범위 id에는 `adapter.mjs`·`drawer.json`·`cases.json`·`data/lessons/<id>.json` 네 파일이 모두 있어야 한다. 없으면 사이트 빌드가 실패한다(`drawer/inject.mjs`의 `assertExamComplete`).
- `relTol`을 기본 0.01보다 크게 준 측정 키마다, `data/lessons/<id>.json`에 그 키를 `variables`에 가진 공식이 있고 그 `note`가 「참고」로 시작해야 한다. 없으면 V3가 실패한다(`toleranceNoteProblems`).
- 배포한 뒤 측정 항목의 키·뜻·단위를 바꾸면 `schemaVersion`을 올린다.
- 같은 양이면 측정 항목 키와 수업 내용 파일의 변수 키를 같게 쓴다.
- 확인 상태 해시는 `drawer/hash.mjs`의 `physicsHash()`로만 계산한다. 다른 곳에서 다시 구현하지 않는다. 해시 범위를 바꾸면 `HASH_SCOPE_VERSION`을 올린다.
- `data/verification-status.json`은 `tools/approve.mjs`·`tools/set-status.mjs`로만 쓴다. 손으로 고치지 않는다.

## 새 시뮬레이션 코드

- 모든 코드 파일의 첫 두 줄: `// Copyright 2026, bsshs-physics-sims contributors` / `// SPDX-License-Identifier: GPL-3.0-only`. `@author`와 사람 이름 금지(테스트가 확인).
- 화면 글자는 `<id>-strings_en.json` 한 파일에 한국어로 쓴다. 한글이 하나도 없으면서 로마자가 3글자 이상 이어진 값이 있으면 테스트가 실패한다(`{{value}}` 자리표시는 빼고 센다).
- 새 시뮬레이션 코드와 문자열·CSS·SVG 파일에 디자인 값이나 다른 주소(`http(s)://`, `ws(s)://`)를 쓰면 테스트가 실패한다.
- 글자는 코드에서 `<Pascal>Strings.<경로>StringProperty`를 매번 끝까지 이어 쓴다. 별명(`const S = …Strings`)이나 구조 분해를 쓰지 않는다.
- 측정할 양은 모델의 공개 Property로, 입력은 바꿀 수 있는 `NumberProperty`로 둔다. 시간에 따라 변하는 모델은 멈추거나 정상 상태에 이를 수 있어야 한다.
- 시뮬레이션 자기 파일에 TypeScript 오류가 하나라도 있으면 빌드 실패다.
- 저장소 이름(폴더 id, `package.json`의 `name`)은 소문자와 `-`만, 숫자·`_` 불가. `phet.supportedBrands`에 `adapted-from-phet`이 있어야 한다.
- PhET 옛 Java 시뮬레이션의 그림·배치·소스를 옮기거나 흉내 내지 않는다.

## 데이터 파일

- 시뮬레이션 목록과 버전은 `data/sims.json` 한 곳에만 적는다. 다른 도구가 목록을 따로 갖지 않는다.
- 저장소 주소는 `brand/bsshs/attribution.mjs`의 `REPO_URL` 한 곳에만 적는다. 바꾸면 출처 문구가 바뀌어 68개 모두 다시 빌드된다.
- 출처 문구 6개(`ATTRIBUTION`)의 글자를 바꾸지 않는다.
- `data/titles.json`의 제목은 고정 번역 원본 제목에 용어 교정을 적용한 값과 같아야 한다(테스트가 확인). 교정이 제목을 바꾸면 두 파일을 같이 고친다.
- 용어 교정의 `reason`은 `오역`·`수업 용어`·`표기` 중 하나다.
- 68개 시뮬레이션 모두 `data/units.json`의 정확히 한 단원(마지막은 「기타」)에 적혀 있어야 한다. 시험 범위가 아닌 시뮬레이션은 그래야 카드가 생긴다.
- 「새 시뮬레이션」의 정의는 `sims/` 아래 `_`로 시작하지 않는 폴더(`listNewSimIds`) 하나뿐이다. 사이트·검증·빌드가 모두 이 정의를 쓴다. 시험 범위 id의 접두어로 새 시뮬레이션을 고르는 코드를 다시 만들지 않는다.
- 빌드 기록(`data/build-matrix*.json`)은 빌드 도구가 쓴다. 손으로 고치지 않고, 빌드한 뒤 바뀐 기록을 같이 커밋한다.

## 검증 관문

- 「완료」는 `npm run verify`가 종료 코드 0일 때만이다. 이 명령이 V1(빌드 68개), V2(check-sim 136번), V3(물리 검사 14개), V4(기록), V5(확인 상태·해시), V6(목록 사이트), V9(닫힌 서랍 배치), V10a(디자인 값), V10b(패치 허용 목록), V10c(실명 검색), `npm test` 전체를 돌린다. 항목은 종료 코드 0, 실패 0건, 센 것 1개 이상일 때만 통과다. 건너뛴 테스트가 있는 항목은 실패로 본다.
- 일부만 다시 돌린 결과(`--only`)로 「완료」라고 하지 않는다.
- 배포는 종료 코드 0으로 끝난 `npm run verify`가 만들거나 확인한 바로 그 `dist/`만 올린다. `build-everything`이 만든 `dist/`는 물리 검사 제외가 적용되지 않은 상태라 배포하면 안 된다. 검증 뒤 `build-everything`이나 `build-site`를 다시 돌렸으면 검증도 다시 한다.
- 배포 완료는 실제 공개 주소 확인(목록 200 + 제목·「학교 공식 자료 아님」 문구, 시뮬레이션 페이지 200, 실제 주소 check-sim 통과)이 있어야 말한다. 로컬 빌드 성공은 배포 확인이 아니다.
- 허용 오차나 검사 플래그를 바꿔 통과시키지 않는다. 사례에 허용 오차를 1%보다 넓게 적을 때는 수업 내용 공식의 「참고」 설명이 반드시 함께 있어야 하고(위 규칙), 그 이유(격자 해상도, 근사식 비교)를 사례 이름이나 어댑터 메모에도 남긴다.
- 검사를 일부러 고장 내 확인(돌연변이 검사)할 때는 정확히 그 검사만 실패해야 한다. 확인 뒤 원래대로 돌린다.

## 커밋과 언어

- 코드 주석과 커밋 메시지는 영어, 화면 문구와 사람용 문서(`docs/`, 모듈 `AGENTS.md`)는 한국어.
- 커밋 메시지는 `type(scope): summary` 모양을 쓴다(`feat`, `fix`, `docs`, `test`, `chore`).
- 이 저장소에서 공개 저장소로 직접 push하지 않는다. 공개는 내보내기 폴더에서만 한다.
- 작업 폴더 경로에 한글이 있다. 셸 명령의 경로는 항상 따옴표로 감싸고, 한글 파일 이름을 비교할 때는 NFC로 정규화한다.
