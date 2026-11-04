# sims/ — 새로 만든 시뮬레이션

## 맡는 것

- `bsshs-photoelectric`(광전 효과), `bsshs-compton`(콤프턴 산란), `bsshs-laser`(레이저, 유도 방출), `bsshs-semiconductor`(반도체·다이오드: 「PN 접합」「정류 회로」 두 화면), `bsshs-polarization`(편광·브루스터각: 「편광판」「반사와 브루스터각」 두 화면). 다섯 개 모두 시험 범위다.
- `_template`: 연습용 틀(한 변의 길이 → 넓이, 물리 없음). `_`로 시작하는 폴더는 빌드·공개 목록에서 빠진다.
- 폴더 하나의 모양: `package.json`, `<id>-strings_en.json`(화면 글자 전부, 한국어), `js/<id>-main.ts`(시작), `js/<camel>.ts`(이름 공간), `js/<Pascal>Strings.ts`(글자 타입, JSON과 손으로 맞춤), `js/<Pascal>Screen.ts`·`js/*Screen.ts`(화면 = 모델 + 보기), `js/model/`(물리), `js/view/`(그리기·조작), `Gruntfile.cjs`, `tsconfig.json`, `.gitignore`.

## 맡지 않는 것

- 서랍 측정 정의·연결 코드·검사 사례는 `adapters/<id>/`다. 시뮬레이션 코드에 서랍 코드를 넣지 않는다.
- 학교 표기, 디자인 색, 외부 통신 끄기는 빌드 때 `theme/`·`brand/` 패치가 공통 부품에 입힌다. 여기서 색을 정하지 않는다.
- PhET 부품(scenery, sun, joist, axon, dot, kite, phet-core, scenery-phet, tandem, bamboo 등)은 빌드 슬롯에 고정 SHA로 놓인다. 저장소에 복사하거나 고치지 않는다.
- PhET 옛 Java 시뮬레이션(Photoelectric Effect, Lasers, Semiconductors 등)의 그림·배치·코드는 옮기지도 흉내 내지도 않는다. 실험 구성은 수업에서 다룬 실험과 물리에서 출발하고, 화면은 새로 설계한다.

## 지켜야 할 것

- 부품은 `data/build-matrix.json`의 `newSimBase` 묶음(energy-skate-park-basics 1.5.0, chipper 2.0.0, Node 24)뿐이다. 그 묶음의 API를 따른다. `phet.phetLibs`에는 묶음에 있는 저장소만 적는다.
- 폴더 이름 = `package.json`의 `name` = id. 소문자와 `-`만(숫자·`_` 불가). PhET 저장소·babel 폴더 이름과 겹치지 않게 `bsshs-` 접두어를 쓴다. `phet.supportedBrands`에 `adapted-from-phet`이 있어야 한다.
- 모든 코드 파일 첫 두 줄: `// Copyright 2026, bsshs-physics-sims contributors` / `// SPDX-License-Identifier: GPL-3.0-only`. `@author`·사람 이름 금지.
- 화면 글자는 `<id>-strings_en.json`에 한국어로(`{ "key": { "value": "한국어" } }`, 중첩 가능, 자리표시 `{{value}}`, 제목 키 `<id>.title`). 한글 없이 로마자 3글자 이상인 값은 테스트가 실패한다.
- **글자는 코드에서 `<Pascal>Strings.<경로>StringProperty`를 매번 끝까지 이어 쓴다.** 별명(`const S = …Strings; S.xStringProperty`)이나 구조 분해를 쓰면 chipper가 그 글자를 경고 없이 빼고, 타입 검사는 통과하지만 시뮬레이션이 시작하자마자 멈춘다.
- **bamboo를 쓰면 두 곳에 적는다**: `package.json`의 `phet.phetLibs: [ "bamboo" ]`, `tsconfig.json`의 `references`에 `{ "path": "../bamboo/tsconfig.json" }`.
- import는 상대 경로에 `.js` 확장자(`.ts` 파일이어도): `import NumberProperty from '../../axon/js/NumberProperty.js'`. 타입 전용은 `import type { TReadOnlyProperty } from '…/axon/js/TReadOnlyProperty.js'`.
- 자기 파일의 TypeScript 오류가 하나라도 있으면 빌드 실패다. 부품 쪽 `phet-io` 모듈 오류 2건은 기록만 된다.
- 디자인 값(`#…`, `rgb(…)`, 글꼴 이름)과 다른 주소(`http(s)://`)를 코드·JSON·CSS·SVG에 쓰지 않는다. 패널·버튼·슬라이더·체크박스는 PhET 기본 부품을 기본 색으로 쓰면 빌드 때 토큰 색이 입혀진다. 물리적 의미가 있는 색(광자)은 파장에서 계산한다(`VisibleColor.wavelengthToColor`).
- **물리 계산은 `js/model/`에만 둔다.** 이 폴더가 물리 내용 해시에 들어가므로, 모델 파일을 바꾸면 선생님 「확인 완료」가 「확인 중」으로 돌아간다. 보기 코드에 물리를 두면 해시가 그 변경을 놓친다. 그래프처럼 보기가 물리식을 써야 하면 모델의 정적 함수를 부른다(예: 반도체 I–V 곡선은 `JunctionModel.shockleyCurrent`를 부르고, 같은 식을 보기에 다시 쓰지 않는다).
- 서랍이 읽을 양은 모델의 공개 Property로(`photonEnergyProperty` 등), 서랍 `drawer.json`이 선언한 단위로 둔다. 입력은 바꿀 수 있는 `NumberProperty`(자동 검사의 `apply`가 씀). 시간에 따라 변하는 모델은 멈추거나 정상 상태로 갈 수 있게 한다.
- 화면을 만들 때 무작위 장식을 그리면(`bsshs-semiconductor` 결정 그림) 배치 비교가 난수 시드를 맞춰야 한다. 새 무작위 요소를 넣으면 V9가 그대로 통과하는지 확인한다.
- 화면 배치는 PhET 시뮬레이션처럼 `layoutBounds` 안에 둔다. 휴대폰 시트가 그 아래 공간을 덮는다.

## 작업 방식

```sh
node tools/build-new-sim.mjs --create <id> --title "한국어 제목"   # _template 복사, 이름 바꾸기
node tools/build-new-sim.mjs <id>                                  # 약 25~40초 → build/bsshs-theme/<id>/<id>_ko.html
node tools/check-sim.mjs build/bsshs-theme/<id>/<id>_ko.html [--width 390]
node tools/build-all.mjs --new-only                                # sims/ 전부(_template 제외)
```

- 빌드 도구는 이 폴더를 슬롯에 복사해 고정 작성자·시각으로 커밋하므로 같은 소스면 같은 SHA가 나온다. 소스가 바뀌면(`sourceHash`) 다시 빌드되고, 빌드 기록을 다시 만들지 않으면 V1이 「소스가 바뀐 뒤 다시 빌드하지 않음」으로 실패한다.
- 빌드가 실패하면 예전에 성공한 결과 HTML도 지운다(낡은 파일이 공개되지 않게).
- 모델 Property 이름을 바꾸면 `adapters/<id>/adapter.mjs`도 같이 고친다.

## 테스트

- `tests/new-sims/sources.test.mjs`: 머리말, `@author` 없음, 디자인 값·주소 없음, 화면 글자가 한국어.
- `tests/new-sims/new-sims.test.mjs`: 폴더·`package.json` 규칙, 빌드 도구 동작.
- `tests/new-sims/common-strings.test.mjs`: 고정된 공통 부품 한국어 문자열이 빌드에 들어갔는지, 기본 설정에서 노출되는 접근성 이름에 영어가 없는지(학교판 빌드와 캐시가 있어야 돈다).
- `tests/physics/bsshs-*.test.mjs`와 V3: `cases.json` 사례. 새 시뮬레이션이 V3에서 하나라도 실패하면 공개 사이트에서 통째로 빠지고 V1이 실패한다.
- 반드시 덮을 물리: 광전 효과(K_max = hf − W, 문턱 아래 광전자 0, 세기는 광전류만, eV₀ = K_max, I–V 특성), 콤프턴(Δλ = (h/mₑc)(1 − cos θ), 운동량·에너지 보존 반동), 레이저(3준위 이상, 펌핑, 자발·유도 방출, 밀도 반전, 같은 위상·방향), 반도체(띠, 도핑, 공핍층, 바이어스 / 반파·브리지 정류, 평활 축전기, 다이오드 모델 세 가지, 오실로스코프), 편광(I = I₀cos²θ, 여러 장, 반사 편광, tan θ_B = n₂/n₁).
