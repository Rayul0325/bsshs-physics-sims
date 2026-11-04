# 실무 메모


## PhET 빌드

- **`AssertionError: Unsupported brand: adapted-from-phet`로 빌드 실패.** chipper 2는 시뮬레이션 `package.json`의 `phet.supportedBrands`에 없는 브랜드를 거부하는데, 63개 중 상당수가 `phet`/`phet-io`만 적혀 있다. 빌드 도구가 이 오류일 때만 임시 슬롯의 `package.json`에 한 줄을 더해 다시 빌드하고 되돌린다. 빌드 기록의 `overlays`와 `strictError`에 남는다. `--no-brand-overlay`면 실패로 기록된다.
- **CCK AC 두 시뮬레이션이 `error TS5083: Cannot read file '…/phet-io/tsconfig-module.json'`으로 멈추고 `--type-check=false`로도 안 꺼짐.** 그 버전 chipper의 Gruntfile이 매번 `tsc --build`를 부르고, 그 설정이 비공개 PhET-iO 저장소 파일을 읽는다. 그 오류 하나만 났을 때 슬롯의 `chipper/js/grunt/Gruntfile.js`에서 타입 검사 호출 두 줄만 빼고 다시 빌드한 뒤 되돌린다(`chipper-skip-tsc`). 다른 타입 오류가 섞여 있으면 다시 하지 않고 실패로 둔다.
- **빌드 로그의 `WARNING404: Skipping potentially non-public dependency`.** PhET-iO 저장소(`phet-io`, `phet-io-wrappers`, `phet-io-sim-specific`, `studio`)는 비공개라 받을 수 없다. 학교판 빌드에는 쓰이지 않으므로 정상이다. 매니페스트 `unavailable`에 적힌다.
- **같은 소스를 빌드했는데 한국어 문자열이 날마다 다를 수 있음.** 번역 저장소 `babel`은 PhET가 SHA를 고정하지 않는다(PhET 빌드 서버는 빌드 순간의 main을 씀). 그래서 `dependencies.json` 주석의 릴리스 시각 직전 `babel` main 커밋을 골라 매니페스트의 `babelSha`에 고정했다. 바꾸지 않는다.
- **맥에서 패치 후보 파일을 잘못 찾음(`updateCheck.js`와 `UpdateCheck.js`).** 맥 파일 시스템은 대소문자를 구분하지 않아 `existsSync`가 둘 다 있다고 답한다. 후보 파일 존재 여부는 git에 묻는다. 새 규칙을 쓸 때도 파일 시스템 대신 git으로 확인한다.
- **같은 파일을 고치는 규칙 두 개 중 앞 규칙의 결과가 사라짐.** 예전에는 뒤 규칙이 다시 원본에서 시작해 덮어써서 charges-and-fields·under-pressure에 "PhET Menu Button"이 남았다. 지금은 `applyPatchRules` 한 번 안에서 같은 파일의 뒤 규칙이 앞 규칙 출력 위에서 이어진다(`tests/terms/compose.test.mjs`). 규칙을 여러 번의 호출로 나눠 적용하면 이 보장이 없다.
- **메뉴줄 배경을 토큰 색으로 바꾸면 joist 동작이 깨짐.** joist가 메뉴줄 색을 `'white'`/`'black'` 글자와 직접 비교해 글자색·로고를 고른다. 그래서 메뉴줄은 PhET 흰색 그대로 두고 글자색만 토큰으로 바꾼다. 홈 화면 메뉴줄이 비교하는 `HomeScreen.BACKGROUND_COLOR`(검정)도 그대로다.
- **자간이나 글자 크기를 시뮬레이션에 넣으면 실험 화면 배치가 달라짐.** 캔버스 글자의 폭 계산이 바뀌기 때문이다. 시뮬레이션에는 글꼴 종류와 색만 넣는다.
- **중간에 끊긴 빌드.** 같은 명령을 다시 실행하면 성공한 시뮬레이션(같은 의존 묶음 + `themeHash` + 결과 파일)은 건너뛴다. 처음부터는 `--force`. 워드마크 그림 크기 같은 코드 변경은 `themeHash`에 안 잡히므로 `--force`로 다시 빌드한다.
- **`slot … is in use by pid …`.** 다른 빌드가 그 슬롯을 쓰는 중이다. 기다리거나 `--slot N`. 죽은 프로세스의 잠금은 자동으로 회수된다. 새 시뮬레이션 빌드는 9번 슬롯부터 거꾸로 찾아 0번을 63개 빌드용으로 비워 둔다.
- **캐시 크기.** 미러·슬롯을 합쳐 약 15 GB다. 지워도 다시 받으면 같은 결과가 나온다(`rm -rf ~/.cache/bsshs-physics-sims`). 다만 워드마크 PNG도 다시 그려진다(아래).

## 학교 표기와 검사

- **워드마크가 컴퓨터마다 조금 다르게 그려짐.** 메뉴줄 워드마크 PNG는 빌드하는 컴퓨터의 Chrome 캔버스에서 그 컴퓨터의 한글 글꼴로 그려 `$BSSHS_CACHE/bsshs-wordmark/`에 저장하고 다시 쓴다. 다른 컴퓨터에서 빌드하면 PNG 바이트와 `bsshs-wordmark-sha256` 메타가 달라진다(검사는 그 빌드 안의 메타와 비교하므로 통과한다). 시작 화면 SVG와 사이트·서랍의 한글은 보는 기기의 글꼴로 그려진다. 배포 결과를 바이트 단위로 재현하려면 같은 컴퓨터·같은 캐시에서 빌드한다.
- **옛 RequireJS 계열 16개에서 워드마크 지문이 안 맞음.** 그 chipper는 로고를 mipmap으로 다시 인코딩한다. `check-sim`이 그 계열은 바이트 해시 대신 화면에 그려진 그림의 픽셀을 `bsshs-wordmark-png` 메타와 비교한다. 같은 이유로 PhET 로고 지문 검사도 그 계열에서는 못 잡으므로, 로고 PNG 원본 파일 자체를 빌드 때 바꾼다.
- **헤드리스 Chrome에서 390px 폭으로 열었는데 500px로 배치됨.** 헤드리스 Chrome은 창 폭 500px 아래로 내려가지 않는다. `check-sim`·`compare-layout`·`run-cases`는 600px 미만이면 CDP 기기 화면 흉내(DPR 3, 터치)로 연다. 직접 스크린샷을 찍을 때도 같은 방법을 쓴다. 실제 폭은 결과의 `viewport.innerWidth`로 확인한다.
- **메뉴줄 글자를 DOM에서 읽을 수 없음.** 메뉴줄은 캔버스/SVG다. 워드마크 확인은 scenery 장면 그래프에서 보이는 그림 노드를 찾아 한다. DOM에 표시를 넣는 방식은 실제로 그려졌는지 증명하지 못해 쓰지 않는다.
- **설정 창·키보드 도움말 창의 「PhET」 표기.** `check-sim`은 시작 화면·메뉴·About 창만 훑는다. 두 창은 열지 않으므로, 63개 빌드의 문자열 표 전체를 훑어 대신 확인했다(설정 창 `moreAccessibility` 한 문장을 고침). 새 문자열을 넣는 PhET 버전 변경이 있으면 이 점검을 다시 한다.

## 수업 서랍과 어댑터

- **옛 joist에서 `drawer.helpers.screen()`·`model()`이 빈 값.** joist 세대가 셋이다: `selectedScreenProperty`(새 계열), `screenProperty`(2019~2021), `screenIndexProperty` + `showHomeScreenProperty`(옛 계열, 홈 화면이 `sim.screens` 밖에 있음). 지금 도우미는 셋 다 처리한다(`tests/drawer/helpers-joist.test.mjs`). 그래도 wave-interference·faradays-law 어댑터는 화면을 직접 찾는다(화면 이름에 장면까지 붙이기 위해).
- **모델 속성 이름이 문서와 다름.** 같은 시뮬레이션도 버전마다 모델 속성 이름이 다르다. 빌드된 HTML을 브라우저에서 열고 콘솔에서 `phet.joist.sim.screens[i].model`을 직접 살펴 어댑터를 쓴다. PhET 저장소의 main 브랜치 코드를 보고 쓰지 않는다.
- **발전기·패러데이 전자기 실험실의 시간·기전력이 25배 어긋남.** 모델 시계는 1/25 s 단위로 걷고, `clock.elapsedTime`은 다음 단계까지 남은 나머지다. 시간은 단계 수 × 1/25 s로, 기전력은 모델의 단계당 값 × 25로 초 단위로 바꾼다. 그래야 「기전력 ÷ 선속 변화율」이 −N이 된다.
- **발전기 rpm 계기 값과 자석 회전 속력이 다름.** 화면 rpm 계기(`rpmProperty`)에는 코일 끌림(최대 0.2)이 곱해지지만 모델의 자석 회전에는 안 들어간다. 둘을 따로 측정 항목으로 두고 공식에 「참고」를 달았다.
- **기하 광학 거울의 곡률반지름 부호가 수업과 반대.** PhET 내부는 거울도 「볼록 +」다. 서랍에서는 수업 규약(오목 +, R = 2f)으로 바꿔 보여 준다. 물체가 초점에 있으면 PhET는 상 거리를 무한대 대신 10⁷ cm로 둔다.
- **파동 간섭 무늬 간격이 Lλ/d보다 5% 이상 큼.** PhET가 격자 위에서 파동 방정식을 풀고, 화면의 L이 d의 몇 배밖에 안 된다. V3 기대값은 두 슬릿까지의 경로차가 λ인 자리(정확한 기하)로 계산하고 허용 오차 4%를 준다. Lλ/d로 바꾸면 8~20% 어긋나 실패한다. 간섭 화면은 점파원 간격이 2칸 단위로 반올림되어 오차가 조금 더 크다.
- **어댑터에서 `import`를 쓰면 주입이 거부됨.** 어댑터는 HTML 안에 인라인 모듈 스크립트로 들어가 내려받을 곳이 없다. 필요한 것은 전역 `bsshsDrawer`와 `drawer.helpers`로만 얻는다.
- **서랍 안을 눌렀는데 시뮬레이션이 반응함(또는 그 반대가 의심될 때).** scenery는 `window`/`document`에서 입력을 받는다. 서랍 호스트가 포인터·터치·휠·키·포커스 이벤트를 `stopPropagation`으로 막는다. 서랍 안에 새 입력 요소를 넣어도 호스트 안에 두면 같은 보호를 받는다.
- **움직임이 멈추지 않는 양의 V3 결과가 `settled: false`.** 값이 0.1초 간격으로 세 번 같아질 때까지 기다리다 5초 뒤 마지막 값으로 비교한 것이다. 어댑터의 `apply`에서 일시 정지하거나 정상 상태로 보내 고정한다.
- **확인 상태를 바꿨는데 화면 배지가 그대로.** 상태와 해시는 주입할 때 계산해 HTML에 넣는다. `npm run build-site`(또는 `build-everything`)로 사이트를 다시 만들고, 검증·배포까지 다시 한다.
- **측정 키를 바꿨더니 학생의 예전 기록 칸이 비어 보임.** 기록은 키로 저장된다. 배포 뒤 키·단위·뜻을 바꿀 때는 `schemaVersion`을 올려야 예전 기록을 CSV로 건네고 지운다.
- **수소 원자 「에너지 준위」, 기하 광학 빛줄기, 반도체 「PN 접합」 결정 그림 때문에 서랍 없는 빌드끼리도 화면이 다름.** 계속 움직이거나 무작위로 그리는 화면이다. V9는 `--pause-clock`(첫 화면 뒤 joist 시계를 멈추고 시간 간격 0으로 한 번 그림)과 `--seed-random`(두 파일의 `Math.random`을 같은 시드로)을 함께 쓴다. 비교 결과의 `shotSha1`이 화면마다 달라야 화면 전환이 실제로 그려진 것이다.

## 새 시뮬레이션

- **타입 검사·빌드는 통과했는데 시작하자마자 멈춤.** 글자를 별명(`const S = …Strings`)이나 구조 분해로 썼다. chipper는 소스 글자를 그대로 훑어 `<Pascal>Strings.…StringProperty`처럼 한 줄로 이어 쓴 참조만 묶는다. 별명으로 쓴 글자는 경고 없이 빠지고, 실행 중 그 값이 없어 멈춘다. 빌드된 HTML에 그 키가 있는지 찾아 확인한다.
- **bamboo(그래프 부품)를 못 찾음.** 두 곳에 적는다: `package.json`의 `phet.phetLibs`에 `"bamboo"`(없으면 chipper가 묶지 않음), `tsconfig.json`의 `references`에 `{ "path": "../bamboo/tsconfig.json" }`(없으면 `tsc -b`가 실패). 예: `sims/bsshs-photoelectric/`.
- **`--locales=ko`로 빌드했는데 영어판이 나오고 `localeToLocalizedName` 오류로 멈춤.** chipper는 `babel/<id>/<id>-strings_ko.json`이 있어야 `ko`를 실제 언어로 인정한다. 빌드 도구가 `<id>-strings_en.json`(내용은 한국어)을 그 자리에 임시로 복사한다. 슬롯에 같은 이름의 babel 폴더가 이미 있으면 거부하므로, PhET 저장소와 겹치지 않는 id를 쓴다.
- **`must be lower-case letters with single dashes`.** chipper는 저장소 이름에 숫자·`_`를 받지 않는다. 틀의 package 이름이 폴더 이름(`_template`)과 다른 `bsshs-template`인 이유다.
- **`TReadOnlyProperty`를 기본 내보내기로 import해 타입 오류.** 고정된 부품 버전의 API를 따른다(`import type { TReadOnlyProperty } from '…/axon/js/TReadOnlyProperty.js'`). 헷갈리면 캐시의 `mirrors/<부품>.git`에서 `newSimBase` SHA로 파일을 읽는다. import는 `.ts` 파일이어도 상대 경로에 `.js` 확장자로 쓴다.
- **부품 쪽 타입 오류 2건이 늘 기록됨.** 공개되지 않은 `phet-io` 모듈을 못 찾는 오류다. 기록만 하고 실패로 보지 않는다. 시뮬레이션 자기 파일의 오류만 실패다.
- **공통 부품의 화면 낭독용 문자열 일부(예: 「Reset All」의 접근성 이름)가 영어.** 고정된 `babel`에 한국어가 없는 문자열이고, `?supportsInteractiveDescription=true`일 때만 노출된다. 68개 빌드 모두 같다. 테스트는 기본 설정에서 노출되는 접근성 이름에 영어가 없는지만 본다. 직접 번역 문자열을 덧대는 것은 용어 교정 범위(기존 번역의 오역 고치기) 밖이다.

## 시험 범위 목록을 바꿀 때

1. 새로 넣는 id에 `adapters/<id>/`의 세 파일과 `data/lessons/<id>.json`을 만든다. 하나라도 빠지면 `npm run build-site`/`build-everything`이 시작하자마자 멈추고 모든 id의 빠진 파일을 한꺼번에 출력한다(`assertExamComplete`). 그 목록을 그대로 할 일 목록으로 쓴다.
2. `tests/data/lessons.test.mjs`는 시험 범위 id를 `data/exam-scope.json`에서 읽지만, 나머지 54개 id(`OTHER_IDS`)와 전체 68개라는 수는 코드에 직접 적혀 있다. 변형 시뮬레이션을 시험 범위로 옮기거나 빼면, 또는 새 시뮬레이션을 더하면 이 목록과 수를 같이 고친다(안 고치면 단원 배정 테스트가 실패).
3. `data/verification-status.json`에 `npm run set-status -- <id> 확인 중`으로 항목을 만든다. 빠진 id는 「확인 중」으로 보이지만 기록을 남겨 둔다.
4. 시험 범위에서 빠지는 시뮬레이션(변형·새 것 모두)은 `data/units.json`의 단원에 남아 있어야 카드가 생긴다. 사이트는 새 시뮬레이션을 `sims/` 폴더에서 찾으므로 시험 범위에서 빠져도 공개는 계속된다.
5. 확인: `npm test` → `npm run build-everything` → `npm run verify`.

## 반복 작업 점검표

### 측정 항목·그래프·사례를 고친 뒤

1. `node tools/inject-drawer.mjs build/bsshs-theme/<id>/<id>_ko.html <id> --out <작업 폴더>/<id>.html` — 형식 오류면 종료 코드 1과 문제 목록.
2. `node tools/run-cases.mjs <작업 폴더>/<id>.html <id>` — 마지막 줄 `{"type":"summary","ok":true,…}`.
3. `node tools/compare-layout.mjs <작업 폴더>/<id>.html build/bsshs-theme/<id>/<id>_ko.html --width 390 --exclude-button --all-screens --pause-clock --seed-random` (1280도) — 종료 코드 0, `diffPixels` 0.
4. 해시가 바뀌었으므로 그 시뮬레이션이 「확인 완료」였다면 「확인 중」으로 보이게 된다. 의도한 변경인지 관리자에게 알린다.
5. 배포 뒤 키·단위·뜻이 바뀌었으면 `schemaVersion`을 올렸는지 본다.

### 용어 교정을 더한 뒤

1. 고칠 문자열이 실제로 빌드에 실리는지(영어 파일에 같은 키) 확인한다. `tests/terms/helpers.mjs`의 `loadPinnedTables()`가 `live` 표시를 준다.
2. `from`이 너무 짧아 다른 문자열까지 바꾸지 않는지 본다. 제목이 바뀌면 `data/titles.json`도 고친다.
3. `node --test tests/terms/*.test.mjs` → `node tools/build-sim.mjs <id> --brand bsshs --theme --force` → 같은 테스트 한 번 더(빌드 결과 검사는 학교판 파일이 있을 때만 돈다).

### 패치 규칙을 더하거나 고친 뒤

1. `node theme/patches/dry-run.mjs` — 체크아웃 없이 63개 고정 버전 파일에서 규칙마다 적용 수와 파일 버전 수를 본다. 필수 규칙이 0인 버전이 없어야 한다.
2. `node --test tests/theme/*.test.mjs`.
3. `npm run build-everything` 뒤 `npm run verify -- --only V1,V2,V10b` — 그다음 전체 `npm run verify`.

## 검증 실행

- **`build-everything` 직후 배포하면 물리 검사에 실패한 기능이 나감.** 물리 검사 실패에 따른 제외(새 시뮬레이션 통째로, 변형 시뮬레이션은 서랍만)는 `npm run verify` 안에서 `dist/`를 다시 만들 때만 적용된다. `build-everything`은 마지막 줄에 이 주의를 출력한다. 종료 코드 0으로 끝난 `npm run verify`가 만들거나 확인한 `dist/`만 배포한다. 사이트 빌드가 `exclusions.json`을 직접 읽지 않는 것은, 오래된 제외 기록이 고친 뒤에도 시뮬레이션을 계속 빼는 일을 막기 위해서다.
- **`--only`에 V3 없이 돌렸더니 V1 결과가 이상함.** V3가 없으면 V1은 마지막 V3 실행이 남긴 `build/verify/exclusions.json`을 그대로 쓴다. 제외 기록에는 `kind`(`sim` = 사이트에서 뺌, `drawer` = 서랍만 뺌)가 있고, V1의 개수는 `sim`만 줄인다. `kind`가 없는 옛 기록은 `sim`으로 읽힌다. 고친 뒤에는 `npm run build-everything` 후 V3를 포함해 다시 검증한다.
- **사례도 다 통과했는데 V3가 실패.** 허용 오차를 1%보다 넓힌 측정 항목에 「참고」 설명이 없다. 그 측정 키를 `variables`에 가진 공식의 `note`를 「참고: …」로 쓴다(보고서에 키, 허용 오차, 첫 사례 이름이 나온다).
- **V6·V4가 「건너뜀」 때문에 실패.** 사이트 브라우저 테스트는 `BSSHS_SITE_DIR`(없으면 `dist/`)에 `index.html`이 있어야 돌고, 실제 빌드 테스트는 `build/bsshs-theme/`에 파일이 있어야 돈다. verify는 건너뛴 테스트가 있는 항목을 실패로 본다. `npm run build-everything`을 먼저 한다.
- **V10c가 「실명 목록 파일 없음」으로 실패.** 새 컴퓨터에는 `~/.config/bsshs-physics-sims/private-names.txt`가 없다. 관리자에게서 받아 두거나 `BSSHS_PRIVATE_NAMES`로 위치를 준다. 목록이 비어 있어도 실패다.
- **브라우저 검사가 동시에 여러 개 돌다 이상하게 실패.** verify는 V2가 끝난 뒤 `npm test`를 돌린다(테스트도 브라우저를 많이 씀). 다른 에이전트·작업이 같은 컴퓨터에서 Chrome을 많이 띄우고 있으면 기다렸다가 혼자 다시 돌린 뒤 판단한다.
- 전체 시간(32코어 맥, 2026-11-04): `build-everything` 처음 약 6분 30초, 바뀐 것이 없을 때 약 1분 50초. `verify` 약 7분.

## 배포 (Cloudflare Pages)

- **`wrangler pages project create`가 `Missing entry-point`로 실패.** wrangler 4.157은 `--force` 없이 Workers 쪽으로 넘기려 한다. 프로젝트는 이미 `--force`로 한 번 만들었다. 다시 만들 일이 없고, 배포 명령에는 `--force`를 붙이지 않는다.
- **`curl https://…/sims/<id>.html`이 308.** Pages가 확장자를 떼는 주소(`/sims/<id>`)로 보낸다. 실제 주소 확인은 `curl -L`로 따라가서 한다. 사이트의 링크는 `.html`을 그대로 쓰며 이동을 거쳐 열린다.
- **없는 주소인데 200이 나옴.** `dist/`에 `404.html`이 없어 Pages가 모르는 주소마다 `index.html`을 200으로 돌려준다(단일 페이지 앱 처리). 시뮬레이션 파일이 빠진 배포도 `/sims/<id>`가 200으로 보인다. 실제 주소 확인은 상태 코드가 아니라 내용(`dist/` 파일과 바이트 비교, 또는 시뮬레이션 `<title>`)으로 한다.
- **배포 뒤 「어느 dist가 올라갔나」.** `dist/`는 `build-everything`이나 `build-site`가 통째로 지우고 다시 만든다. 배포 전 `build/verify/report.json`의 시각이 `dist/` 안 파일들의 수정 시각보다 늦은지 보고, 아니면 다시 검증한다.
- **배포 뒤 루트에 `.wrangler/`가 생김.** wrangler 임시 폴더다. gitignore되어 있으며 커밋하지 않는다.

