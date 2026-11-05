# 직접 만드는 시뮬레이션 5개의 빌드 방법

광전 효과, 콤프턴 산란, 레이저, 반도체·다이오드, 편광 시뮬레이션은 PhET 시뮬레이션을 고친 것이 아니라 **새로 설계한 것**입니다.
화면을 그리는 공통 부품(scenery, sun, joist, axon, dot, kite, phet-core, scenery-phet, tandem 등, MIT 라이선스)만 PhET 것을 쓰고,
실험 장치·그림·배치·코드는 모두 새로 만듭니다. PhET의 옛 Java 시뮬레이션(Photoelectric Effect, Lasers, Semiconductors 등)의 그림·배치·코드를 옮기거나 흉내 내지 않습니다.
63개를 다시 빌드하는 방법은 [build.md](build.md), 학교 표기·디자인은 [theme.md](theme.md), 수업 서랍은 [drawer.md](drawer.md)를 보세요.

## 한 번에 하기

```sh
node tools/build-new-sim.mjs --create photoelectric-effect --title "광전 효과"   # 틀(sims/_template)을 복사해 새 시뮬레이션 만들기
node tools/build-new-sim.mjs photoelectric-effect          # 빌드 (약 40초)
node tools/check-sim.mjs build/bsshs-theme/photoelectric-effect/photoelectric-effect_ko.html             # 데스크톱 검사
node tools/check-sim.mjs build/bsshs-theme/photoelectric-effect/photoelectric-effect_ko.html --width 390 # 휴대폰 폭 검사
node tools/build-all.mjs --new-only                       # sims/ 안의 시뮬레이션 전부 (_template 제외)
node tools/build-all.mjs --brand bsshs --theme --include-new   # 63개 학교판 + 새 시뮬레이션
```

- 결과물: `build/bsshs-theme/<id>/<id>_ko.html` (63개 학교판과 같은 폴더, 파일 하나로 열림)
- 빌드 기록: `data/build-matrix.new-sims.json` (63개의 빌드 기록 파일은 건드리지 않음)
- 로그: `build/logs/new-sims/<id>.log`
- `build-all`에 `--include-new`·`--new-only`를 주지 않으면 63개 빌드는 예전과 똑같이 동작합니다(새 시뮬레이션 빌드 코드는 불러오지도 않음).

## 폴더 구조

```
sims/<id>/
  package.json                 이름 = <id>, supportedBrands에 adapted-from-phet 포함
  <id>-strings_en.json         화면 글자 전부 (한국어로 씀, 아래 「글자」)
  js/<id>-main.ts              시작 파일
  js/<Id>Strings.ts            글자 접근용 타입 (JSON과 손으로 맞춤)
  js/<Id>Screen.ts             화면 = 모델 + 보기
  js/model/                    물리 계산 (물리 내용 해시에 들어감)
  js/view/                     그리기·조작
  Gruntfile.cjs, tsconfig.json, .gitignore
```

`sims/_template/`은 연습용 틀입니다(한 변의 길이 → 넓이, 물리 내용 없음). 공개 빌드에 들어가지 않습니다. 자세한 사용법은 `sims/_template/README.md`.

## 기준 부품 묶음 (`newSimBase`)

새 시뮬레이션은 `data/build-matrix.json`의 `newSimBase`에 고정된 부품 SHA로만 빌드합니다. 지금은 **energy-skate-park-basics 1.5.0의 부품 묶음, chipper 2.0.0, Node 24**입니다(63개 중 가장 최신 공통 부품, 고른 기준은 build.md).

- 그 묶음에서 시뮬레이션 저장소(energy-skate-park-basics 자신과 energy-skate-park)만 빼고, 나머지 22개 부품(chipper, perennial-alias, brand 포함)과 번역 저장소 `babel`을 그 SHA 그대로 씁니다. 어느 것이 시뮬레이션 저장소인지는 각 저장소 `package.json`의 `phet.simulation`으로 판단합니다.
- 빌드할 때마다 슬롯의 모든 부품이 그 SHA인지 다시 확인하고(`slotShasMatchBase`), 다르면 빌드하지 않습니다.
- 부품 묶음이 바뀌면(`libsHash`가 달라짐) 이어서 빌드할 때 다시 빌드합니다.

## 빌드가 하는 일

1. 빈 슬롯을 하나 잠급니다(`--slot N`을 안 주면 9번부터 거꾸로 찾음. 63개 빌드가 기본으로 쓰는 0번을 비워 두려고).
2. 슬롯에 부품 22개 + `babel`을 고정 SHA로 체크아웃합니다(63개와 같은 캐시·같은 방법).
3. `sims/<id>/`를 슬롯 안 `<package 이름>/` 폴더로 복사하고, 그 폴더를 임시 git 저장소로 만들어 한 번 커밋합니다. 작성자 이름·시각을 고정해서 **같은 소스면 늘 같은 커밋 SHA**가 나옵니다(`stagedSha`). chipper가 빌드 결과에 형제 저장소 SHA를 적기 때문입니다.
4. 타입 검사(`tsc -b`)를 따로 돌립니다. chipper는 `adapted-from-phet` 브랜드 빌드에서 타입 검사를 건너뛰기 때문입니다. **시뮬레이션 자기 파일에 타입 오류가 하나라도 있으면 빌드 실패**입니다. 부품 쪽 오류(공개되지 않은 `phet-io` 모듈을 못 찾는 2건)는 기록만 합니다(`typeCheck`). `--no-type-check`로 끌 수 있습니다.
5. 63개 학교판과 **같은 패치**를 적용합니다: 학교 표기(워드마크 「부산과학고」, About 출처 문구), 외부 통신 끄기, 디자인 토큰, 공통 부품의 한국어 용어 교정(`data/term-fixes.json`의 `global`).
6. chipper로 빌드합니다: `grunt build --brands=adapted-from-phet --locales=ko --lint=false --type-check=false`.
7. 63개와 같은 방법으로 HTML에 브랜드 표시·테마 CSS·글꼴을 넣고 `build/bsshs-theme/<id>/<id>_ko.html`에 씁니다.
8. 패치를 모두 되돌리고, 슬롯에 넣었던 시뮬레이션 폴더와 babel의 한국어 파일을 지웁니다. 모든 부품 저장소가 고친 곳 없이 깨끗한지 `git status`로 확인합니다(`trackedChangesAfterBuild` 빈 배열, `slotCleanAfterCleanup: true`).
   시뮬레이션의 `node_modules`(grunt 하나)는 다음 빌드를 위해 슬롯의 `.new-sims-keep/`에 보관합니다.
9. 실패하면 예전에 성공했던 결과 HTML도 지웁니다(낡은 파일이 공개 빌드에 섞이지 않게).

같은 소스·같은 부품 묶음·같은 테마로 이미 성공했으면 건너뜁니다. 다시 하려면 `--force`.

### 빌드 기록 (`data/build-matrix.new-sims.json`)

시뮬레이션마다 한 줄: `id`, `repo`(package 이름), `version`, `sourceHash`(소스 파일 해시), `stagedSha`, `base`(기준 시뮬레이션·버전·depsHash), `libsHash`·`deps`(쓴 부품 SHA), `babelSha`, `chipperVersion`, `nodeVersion`, `slot`, `slotShasMatchBase`, `typeCheck`, `patches`, `themeHash`, `success`, `outputPath`, `outputBytes`, `error`, `trackedChangesAfterBuild`, `slotCleanAfterCleanup`, `physicsHash`(drawer/hash.mjs, `js/model/**` 포함), `logPath`, `buildSeconds`, `builtAt`.

## 글자 (한국어를 어떻게 넣는가)

**결정: 화면 글자는 `<id>-strings_en.json` 한 파일에 한국어로 직접 씁니다.**

- chipper는 영어(`en`)를 기본 언어로 고정해 두고, 그 파일이 모든 글자 키를 정의해야 빌드합니다. 그래서 파일 이름은 `_en`이지만 내용은 한국어입니다.
- chipper는 `babel/<id>/<id>-strings_ko.json`이 있어야만 `ko`를 실제 언어로 인정합니다(`getLocalesFromRepository`). 없으면 `--locales=ko`로 빌드해도 조용히 `en`으로 빌드되고, 시작하자마자 `localeToLocalizedName` 오류로 멈춥니다(실제로 겪음).
  그래서 빌드할 때만 같은 파일을 슬롯의 `babel/<id>/<id>-strings_ko.json`으로 복사하고, 빌드 뒤 지웁니다. babel이 이미 가진 폴더 이름이면 거부합니다.
- 시뮬레이션 폴더에 `<id>-strings_ko.json`을 따로 두면 그 파일을 대신 씁니다(나중에 영어판을 따로 만들 때를 위한 길).
- 결과: 화면 언어 `ko`, 제목·화면 이름·라벨 모두 한국어. 값 안에 영어 단어가 있으면 테스트가 실패합니다(단위 `cm`, `{{value}}` 같은 자리 표시는 괜찮음).
- 공통 부품(joist 메뉴 등)의 한국어는 63개와 같이 고정된 `babel`의 번역을 씁니다.

## TypeScript

- PhET 부품이 TypeScript라서 TypeScript(`.ts`)로 쓰는 것을 권합니다. JavaScript(`.js`)도 빌드는 되지만 타입 검사의 도움을 못 받습니다.
- import는 상대 경로에 `.js` 확장자로 씁니다(`.ts` 파일이어도): `import NumberProperty from '../../../axon/js/NumberProperty.js';`
- 고정된 부품 버전의 API를 따라야 합니다. 예: `TReadOnlyProperty`는 기본 내보내기가 아니라 `import type { TReadOnlyProperty } from '…/axon/js/TReadOnlyProperty.js'`입니다(틀을 만들 때 타입 검사가 실제로 잡아냄). API가 헷갈리면 `~/.cache/bsshs-physics-sims/mirrors/<부품>.git`에서 `newSimBase`의 SHA로 파일을 읽어 확인하세요.

## 자주 빠지는 함정 두 가지

- **글자는 반드시 `<Sim>Strings.…StringProperty` 모양 그대로 씁니다.** chipper는 빌드할 때 코드를 글자 그대로 훑어서 `BsshsPhotoelectricStrings.anodeStringProperty`처럼 **모듈 이름부터 `StringProperty`까지 한 줄로 이어 쓴 것만** 묶음에 넣습니다. `const S = BsshsPhotoelectricStrings;` 같은 별명을 만들어 `S.anodeStringProperty`로 쓰면 chipper가 그 글자를 찾지 못해 **아무 경고 없이 빼 버리고**, 타입 검사도 통과하지만 시뮬레이션은 시작하자마자 멈춥니다(그 글자 값이 없음). 구조 분해(`const { anodeStringProperty } = …Strings`)도 같은 이유로 안 됩니다. 길어도 매번 전체 이름으로 씁니다.
- **bamboo(그래프 부품)를 쓰려면 두 곳에 적습니다.** `package.json`의 `phet.phetLibs`에 `"bamboo"`를 넣고(`"phetLibs": [ "bamboo" ]`, 빌드 도구는 `newSimBase` 부품 묶음에 있는 저장소만 받아들임), `tsconfig.json`의 `references`에 `{ "path": "../bamboo/tsconfig.json" }`를 더합니다. 앞의 것이 없으면 chipper가 bamboo를 묶지 않고, 뒤의 것이 없으면 타입 검사(`tsc -b`)가 bamboo 파일을 못 찾아 빌드가 실패합니다. 예: `sims/bsshs-photoelectric/`.

## 지켜야 할 것 (테스트가 확인)

- 모든 코드 파일 첫 두 줄: `// Copyright 2026, bsshs-physics-sims contributors` / `// SPDX-License-Identifier: GPL-3.0-only`. `@author`나 사람 이름은 쓰지 않습니다.
- 디자인 값(색 `#…`·`rgb(…)`, 글꼴 이름)은 `sims/`에 쓰지 않습니다. 패널·버튼·슬라이더·체크박스는 PhET 기본 부품을 기본 색으로 쓰면 빌드 때 `theme/tokens.json` 색으로 바뀝니다. 광자 색처럼 **물리적 의미가 있는 색**은 파장에서 계산합니다(`VisibleColor.wavelengthToColor`).
- 새 시뮬레이션에도 안쪽 디자인 검사가 적용됩니다(V11은 `data/style-done.json`에 든 id, V12는 5개 모두). 새 시뮬레이션의 `build-new-sim`은 시뮬레이션별 규칙과 해시를 63개와 같은 방식으로 받습니다(`variantInputs`의 `newSim` 표시가 있으면 해시에 `sim` 토큰 묶음 전체가 들어갑니다). `js/view/`의 색은 토큰 모듈 `SimTokens`에서 읽습니다. 이 모듈(`js/view/SimTokens.ts`, `theme/sim-tokens-module.mjs`가 `color`·`sim` 토큰으로 만든 글)은 `build-new-sim`이 스테이징할 때 슬롯의 복사본에만 쓰고 커밋하지 않으므로 `sims/` 소스에는 색 값이 없습니다(`tests/new-sims/sources.test.mjs`). 소스에서는 `import SimTokens from './SimTokens.js'` 하고 `SimTokens.physics.electron`처럼 역할 이름으로 씁니다(편집기에서는 이 파일이 없어 빨간 줄이 보이지만 빌드와 타입 검사는 슬롯에서 돕니다). 모델 파일은 건드리지 않으므로 `physicsHash`는 그대로입니다.
- 코드에 다른 주소(`http(s)://`)를 넣지 않습니다(외부 요청 금지). `check-sim`이 실제 요청을 기록해 확인합니다.
- `package.json`의 `phet.supportedBrands`에 `adapted-from-phet`가 있어야 합니다(학교판 `bsshs`가 이 브랜드 자리를 빌려 씀).

## 수업 서랍과 물리 검사

- 다섯 개 모두 시험 범위라 수업 서랍을 붙입니다. 방법은 63개와 같습니다([drawer.md](drawer.md)): `adapters/<id>/`에 `drawer.json`, `adapter.mjs`, `cases.json`을 두고 `node tools/inject-drawer.mjs build/bsshs-theme/<id>/<id>_ko.html <id>`.
- 어댑터는 `phet.joist.sim.screens[i].model`(= `drawer.helpers.model()`)에서 값을 읽습니다. 그래서 **측정할 양은 모델의 공개 Property로** 두고(`photonEnergyProperty` 등), 입력은 바꿀 수 있는 `NumberProperty`로 둡니다(자동 검사의 `apply()`가 씀). 시간에 따라 변하는 모델은 멈추거나 정상 상태로 갈 수 있게 합니다.
- 물리 내용 해시(`physicsHash`)에는 `sims/<id>/js/model/**`가 들어갑니다. 모델 파일을 바꾸면 선생님 확인이 「확인 중」으로 돌아갑니다. 보기(view) 코드는 들어가지 않습니다.
- **자동 물리 검사(`tools/run-cases.mjs`)를 통과하지 못한 새 시뮬레이션은 통째로 공개 빌드에서 뺍니다**(사양 3.6). 이 빌드 도구는 빌드 성공 여부만 기록하고, 공개에서 빼는 일은 공개 빌드 단계가 합니다.

## 문제 해결

- **`must be lower-case letters with single dashes`**: chipper는 저장소 이름에 소문자와 `-`만 받습니다(숫자·`_` 안 됨). 그래서 틀의 package 이름은 폴더 이름(`_template`)과 다른 `bsshs-template`입니다.
- **`type check: N error(s) in <id>`**: 로그(`build/logs/new-sims/<id>.log`)에 파일·줄 번호가 있습니다. 실패해도 슬롯은 정리됩니다.
- **시작하자마자 `localeToLocalizedName` 오류**: babel 한국어 파일이 빠진 빌드입니다. 이 도구는 자동으로 넣으므로 생기지 않아야 합니다.
- **`… is not a staged new sim; refusing`**: 슬롯에 같은 이름의 다른 폴더(PhET 저장소)가 있습니다. 이 도구는 자기가 만든 폴더(`.git/bsshs-new-sim` 표시)만 지웁니다. 이름이 PhET 저장소와 겹치면 다른 이름을 고르세요.
- **`slot … is in use`**: 모든 슬롯이 다른 빌드에 쓰이는 중입니다. 잠시 뒤 다시 하거나 `--slot N`.
- **빌드 결과를 슬롯에서 직접 보고 싶을 때**: `--keep-stage`(시뮬레이션 폴더를 지우지 않음). 다음 빌드가 알아서 갈아 끼웁니다.
- **타입 검사·빌드는 통과했는데 시작하자마자 멈춤**: 글자를 별명(`const S = …Strings`)이나 구조 분해로 썼는지 확인하세요(위 「자주 빠지는 함정」). 빌드된 HTML에 그 글자 키가 없습니다.
- **`phet.phetLibs lists …, which is not in the newSimBase library set`** 또는 bamboo 파일을 못 찾는 타입 오류: 위 「자주 빠지는 함정」의 bamboo 두 곳을 확인하세요.
- **빌드 시간**: 처음 한 번은 부품 체크아웃과 `npm ci` 때문에 몇 분, 그 뒤로는 약 25~40초(타입 검사 약 15~20초 포함).
