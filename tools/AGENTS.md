# tools/ — 받기, 빌드, 검사, 검증, 확인 기록 명령

## 맡는 것

| 파일 | 하는 일 |
|---|---|
| `fetch-sources.mjs` | `data/sims.json`의 63개와 형제 저장소를 캐시에 bare 미러로 받고 시뮬레이션별 매니페스트(고정 SHA, `babelSha`, chipper 버전, 부품 날짜, `unavailable`)를 쓴다 |
| `build-sim.mjs` | PhET 시뮬레이션 하나를 슬롯에서 고정 SHA로 체크아웃 → 패치 → chipper 빌드 → 되돌림 → HTML 머리 삽입. 빌드 종류: 없음(`baseline`), `--brand bsshs`, `--theme`, 둘 다(`bsshs-theme`, 배포용) |
| `build-all.mjs` | 여러 개를 슬롯 수만큼 병렬로. `--include-new`·`--new-only`면 `sims/`의 새 시뮬레이션도 |
| `build-new-sim.mjs` | 새 시뮬레이션 하나를 `newSimBase` 부품으로 빌드, `--create`로 틀 복사 |
| `build-everything.mjs` | 68개 학교판 빌드 → 빌드 기록 정리 → `dist/` 사이트(썸네일 포함). 이 `dist/`는 V3 제외가 적용되지 않은 상태이고, 마지막 줄에 그 주의를 출력한다 |
| `check-sim.mjs` | 시뮬레이션 하나(파일 또는 http(s) 주소)를 헤드리스 Chrome으로 열어 오류·워드마크·PhET 로고·About 출처·외부 요청·글꼴·「PhET」 이름을 검사. `--refresh-logo-fingerprints`는 캐시의 phetsims/brand 미러에서 PhET 로고·시작 화면 지문 목록(`lib/phet-logo-fingerprints.json`)을 다시 만든다 |
| `compare-layout.mjs` | 두 HTML의 화면을 픽셀 비교(V9) |
| `check-style.mjs` | 빌드된 시뮬레이션 하나의 안쪽이 토큰 팔레트만 쓰는지(V11): 모든 화면과 키보드 도움말·설정 창의 장면 그래프 색, 화면 픽셀 비율, 글자 대비. 예외는 `theme/sim-styles/<id>.json` |
| `compare-bounds.mjs` | 디자인을 바꾸기 전 학교판 68개의 고정본(`--freeze`, 덮어쓰기는 `--force`)과 지금 빌드를 모든 화면의 노드 상자로 비교(V12) |
| `style-review.mjs` | 전후 스크린샷과 V11·V12 요약을 모은 `build/style-review/index.html` |
| `inject-drawer.mjs` | 빌드된 HTML 하나에 서랍을 넣는 CLI(`drawer/inject.mjs` 감싸기) |
| `run-cases.mjs` | 서랍 넣은 HTML에서 `cases.json` 사례를 돌림(V3) |
| `verify.mjs` | V1~V6, V9, V10a~c, V11, V12, `npm test`를 한 번에, `build/verify/report.json` |
| `approve.mjs`, `set-status.mjs` | 확인 상태 기록(`lib/status-file.mjs`) |
| `lib/` | 경로(`paths`), 목록(`sims`), 매니페스트(`manifest`), 의존(`deps`), git(`git`), 슬롯 잠금(`slots`), chipper 세대·인자(`chipper`), Node 고르기(`node`), 실행(`exec`), 빌드 실패 판별·덧대기(`build-helpers`), 빌드 기록(`matrix`), 빌드 종류(`variant`), 새 시뮬레이션(`new-sims`), 고정 번역표(`ko-strings`), PhET 로고 지문(`phet-logos`, `phet-logo-fingerprints.json`), 상태 파일(`status-file`), 검증 공용(`verify-core`: 허용 목록, 실명 검색, 결과 집계), 테스트 이벤트 보고(`test-events-reporter`), 고정 버전 읽기 전용 접근(`pinned`: git 미러에서 파일 목록·내용), 브라우저 공용(`page-control`: 반복 가능한 시간 흐름, 화면 돌기), 안쪽 검사의 브라우저 쪽 함수(`style-page`)와 순수 규칙(`style-core`) |

## 맡지 않는 것

- 패치 규칙의 내용은 `theme/patches/`와 `brand/bsshs/patches.mjs`다. 빌드 도구에 PhET 파일을 고치는 코드를 직접 넣지 않는다(덧대기 두 가지는 예외, 아래).
- 서랍 형식 검사·해시·상태 해석은 `drawer/`다. 도구는 그 함수를 불러 쓴다(해시를 다시 구현하지 않는다).
- 사이트 HTML 모양은 `site/`다.
- 배포·공개 저장소 push는 도구가 하지 않는다.

## 지켜야 할 것

- **고정 버전**: 체크아웃한 `package.json` 버전이 `data/sims.json`과 다르면 멈춘다. 실패한 시뮬레이션을 다른 브랜치·SHA로 다시 시도하는 코드를 넣지 않는다.
- **슬롯**: 한 슬롯은 한 번에 한 빌드(`.lock`, pid 기록, 죽은 잠금은 회수). 체크아웃은 `git checkout --force --detach` + 추적되지 않는 파일 삭제(`node_modules`는 유지). 빌드 전에 시뮬레이션 `build/`와 `chipper/dist`를 지운다. 새 시뮬레이션은 9번 슬롯부터 거꾸로 찾는다.
- **빌드 뒤 깨끗함**: 모든 패치·덧대기를 되돌린 뒤 형제 저장소의 `git status`를 기록한다(`trackedChangesAfterBuild`). 실패해도 `finally`에서 되돌린다. 새 시뮬레이션은 슬롯에 넣은 폴더와 babel 한국어 파일을 지우고 `slotCleanAfterCleanup`을 기록한다. 자기가 만든 폴더(`.git/bsshs-new-sim` 표시)만 지운다.
- **덧대기는 두 가지뿐**: chipper 2가 `Unsupported brand: adapted-from-phet`으로 거부할 때 `package.json` `supportedBrands`에 한 줄, CCK AC 두 시뮬레이션이 `TS5083`(비공개 `phet-io/tsconfig-module.json`) 하나로만 실패할 때 `chipper-skip-tsc`. 다른 타입 오류가 섞여 있으면 다시 하지 않는다. 그 밖의 덧대기를 더하면 V10b가 실패한다.
- **chipper 인자**: chipper 0.0.0(RequireJS)은 `--brand=`, chipper 2.x는 `--brands=`. 공통 `--locales=ko --lint=false`. 새 시뮬레이션은 `--type-check=false`로 빌드하고 `tsc -b`를 따로 돌린다(자기 파일 오류 = 실패).
- **이어 하기**: 성공 기록 + 같은 의존 묶음 + 같은 `themeHash`(+ 새 시뮬레이션은 같은 `sourceHash`·`libsHash`) + 결과 파일이 있으면 건너뛴다. `themeHash`는 시뮬레이션마다 다르다: 전체 규칙의 글, 그 시뮬레이션의 색 파일과 그림이 들어간다(`theme/AGENTS.md`). `variantInputs(opts).forSim(id, deps)`가 그 시뮬레이션의 규칙·맥락·해시를 돌려준다. 실패한 새 시뮬레이션은 예전 결과 HTML을 지운다.
- **헤드리스 Chrome**: Playwright `channel: 'chrome'`(설치된 Chrome)만 쓴다. V11·V12 도구는 동시에 8개를 넘기지 않는다(`verify`의 `STYLE_JOBS_MAX`). WebGL 시뮬레이션이 겹치면 오히려 느려지고 탭이 죽는다. 폭 600px 미만은 CDP 기기 흉내(DPR 3, 터치)로 연다. 창 폭을 줄이는 방식은 500px 아래로 내려가지 않아 쓰지 않는다.
- **check-sim JSON**(`schemaVersion` 1)과 `report.json`(`schemaVersion` 1)은 키를 더하기만 한다. 종료 코드는 0 통과 / 1 검사 실패 / 2 사용법·브라우저 오류.
- **verify 판정**: 항목은 종료 코드 0, 실패 0, 센 것 1 이상일 때만 통과. 건너뛴 테스트가 든 항목은 실패. V3에서 실패하면 제외 기록(`build/verify/exclusions.json`, `{ id, kind, reason }`)을 쓰고 `site/build-site.mjs`로 `dist/`를 다시 만든다: 새 시뮬레이션은 `kind: 'sim'` → `--exclude`(V1 개수가 줄어 V1도 실패), 시험 범위 PhET 시뮬레이션은 `kind: 'drawer'` → `--no-drawer`(서랍 없이 공개, V1 개수 그대로, V3는 실패). `kind`가 없는 옛 기록은 `sim`. 이미 반영된 사이트는 다시 만들지 않는다(`siteNeedsRebuild`). V3에는 정적 검사도 있다: `relTol`이 0.01보다 큰 측정 키마다 수업 내용 공식에 「참고」로 시작하는 `note`가 있어야 한다(`toleranceNoteProblems`). 허용 오차·플래그 기본값(V3 상대 1%·절대 1e-9, V9 다른 픽셀 0)을 바꿔 통과시키지 않는다.
- **실명 검색(V10c)**: 이름은 출력·보고서·로그에 절대 쓰지 않는다. 파일 이름과 건수, 목록 지문만. 목록 파일이 없거나 비면 실패. 찾는 모양: UTF-8 NFC·NFD, `\uXXXX`(대·소문자), `&#…;`·`&#x…;`.
- **빌드 기록 정리**(`build-everything`): 컴퓨터 경로를 `$BSSHS_CACHE`와 `.`로 바꾸고 줄 순서를 `data/sims.json` 순서로 고정한다. 바뀐 시뮬레이션이 없으면 `generatedAt`도 그대로 두어 파일이 바이트까지 같다.
- 이 폴더 코드에도 색·글꼴 이름 값을 쓰지 않는다(디자인 값 검사 대상).
- 경로에 한글이 있다. 자식 프로세스·셸에 넘기는 경로는 배열 인자로 넘기고, 문자열로 셸에 붙이지 않는다.

## 작업 방식

- 새 CLI 도구는 `lib/cli.mjs`의 `isMain(import.meta.url)`로 실행을 가르고, `main(argv)`가 종료 코드를 돌려주게 한다(테스트가 `main`을 직접 부름).
- 출력은 기계가 읽을 JSON 한 줄(또는 마지막 줄 JSON), 사람용 요약은 한국어 한 줄.
- 브라우저를 여는 도구는 같은 준비 조건을 쓴다: `phet.joist.sim`과 화면 있음, 생성 완료 속성이 있으면 `true`, 시작 화면 요소 사라짐. 화면을 도는 방법도 `compare-layout`의 함수(`listScreens`, `selectScreen`, `renderFrozen`)를 그대로 쓴다.
- 안쪽 검사(V11·V12)는 `lib/page-control.mjs`의 `openSim`으로 연다: 난수 고정, 가상 시계(프레임마다 1/60초), 시뮬레이션이 다 지어진 뒤 30프레임에서 시뮬레이션 시계 정지. 시계를 멈추면 조이스트가 입력도 꺼서 창을 열 때는 `enableInput`으로 입력만 다시 켠다. `style-page.mjs`의 함수는 브라우저로 글이 넘어가므로 바깥 변수를 쓰지 않는다. 클래스 이름은 빌드에서 뭉개져 있어서 `phet.<이름공간>.<이름>`에서 거꾸로 찾는다(`probe()`).
- 장면 그래프를 훑을 때 `getSelfShape()`를 쓰지 않는다(wave-interference 한 화면에서 24초, 3D 노드에서는 탭이 죽음). 선 두께를 뺀 도형은 `getShape()`로 얻는다.

## 테스트

- `tests/tools/`: 인자 해석(`cli-args`), 빌드 도우미(실패 판별, 덧대기), chipper 세대·인자, 의존 계산, 빌드 기록·건너뛰기·`newSimBase` 고르기(`matrix`), 목록, 슬롯 잠금.
- `tests/theme/check-sim.test.mjs`, `tests/theme/build-variant.test.mjs`: check-sim 판정과 빌드 종류.
- `tests/verify/verify-core.test.mjs`: 허용 목록 검사, 실명 검색(모양별), 결과 집계, `--only` 해석, 빌드 기록 정리.
- `tests/verify/exclusions.test.mjs`(V5 묶음): 제외 종류, 사이트 인자, V1 개수에 `sim`만 반영.
- `tests/verify/tolerance-notes.test.mjs`: 넓힌 허용 오차와 「참고」 설명 연결.
- `tests/tools/style-core.test.mjs`: 팔레트 맞춤, 대비, 지적 만들기, 예외(승인자 없음, 20건 초과), 완료 목록, 노드 상자 비교, 고정본 덮어쓰기 거부.
- `tests/theme/sim-color.test.mjs`·`art.test.mjs`·`sim-hash.test.mjs`·`sim-tokens.test.mjs`, `tests/verify/patch-allowlist-sim.test.mjs`: 색 규칙의 네 가지 거절, 그림 크기 검사와 모듈 다시 쓰기, 시뮬레이션별 해시, `sim` 토큰, 새 종류의 허용 목록.
- `tests/status/status-tools.test.mjs`: `approve`·`set-status`(시험 범위 밖 거부, `확인 완료`는 `approve`만).
- 검사를 고치면 일부러 고장 낸 입력(빌드 기록 한 줄을 허용 목록 밖 파일로 바꾸기, `dist/`에 실명 한 줄 든 파일 두기, 사례 값 하나를 5% 바꾸기)에서 정확히 그 항목만 실패하는지 확인하고 되돌린다. 거절 조건(모델 경로, 색이 아닌 글자, 그림 크기, 예외 승인·개수)은 조건을 하나씩 꺼서 그 조건의 테스트만 실패하는지 본다. 되돌릴 때는 미리 떠 둔 복사본으로 되돌린다(커밋 전이면 `git checkout`이 고친 내용까지 지운다).
