# 전체 빌드와 검증 (사양 5)

배포하기 전에 두 명령만 차례로 실행합니다. **`npm run verify`가 끝 코드 0으로 끝나야 「완료」입니다.**

```sh
npm run build-everything     # 시뮬레이션 68개 빌드 + 빌드 기록 정리 + 목록 사이트(dist/, 썸네일 포함)
npm run verify               # V1~V12 전부, 보고서 build/verify/report.json
npm run verify -- --only V2,V9   # 일부만 다시
```

## `npm run build-everything` (`tools/build-everything.mjs`)

1. `build-all --brand bsshs --theme --jobs 10 --include-new`: PhET 63개 학교판과 직접 만든 시뮬레이션 5개를 `build/bsshs-theme/<id>/<id>_ko.html`로 빌드합니다. 이미 같은 조건으로 빌드된 것은 건너뜁니다(`--force`로 전부 다시).
2. 빌드 기록 `data/build-matrix*.json`을 커밋하기 좋은 모양으로 정리합니다: 오류 문구 안의 이 컴퓨터 경로(캐시 폴더 → `$BSSHS_CACHE`, 저장소 폴더 → `.`)를 바꾸고, 줄 순서를 `data/sims.json` 순서(새 시뮬레이션은 id 순서)로 고정합니다. SHA·해시·빌드 시각 같은 값은 그대로 둡니다. 다시 실행해도 바뀌지 않은 시뮬레이션의 줄은 그대로입니다.
3. `site/build-site.mjs --thumbs`로 `dist/`(git에 넣지 않음)에 목록 사이트를 만듭니다. 시험 범위 14개에는 이때 수업 서랍이 들어갑니다.

끝 코드: 빌드나 사이트 중 하나라도 실패하면 1.

**배포 규칙: `build-everything`이 만든 `dist/`는 아직 V3(물리 검사)를 거치지 않았습니다.** 물리 검사에 실패한 기능을 빼는 일(아래 「제외 규칙」)은 `npm run verify` 안에서만 일어납니다. 그래서 **끝 코드 0으로 끝난 `npm run verify`가 만들거나 확인한 `dist/`만 배포합니다.** `build-everything`을 마친 직후 바로 배포하면 불변 규칙 6(자동 물리 검사에 실패한 기능은 공개 빌드에 들어가지 않는다)을 건너뜁니다. 이 안내는 `build-everything`의 마지막 줄에도 출력됩니다. (사이트 빌드가 `exclusions.json`을 직접 읽게 하지 않은 이유: 오래된 `exclusions.json`이 고친 뒤에도 시뮬레이션을 계속 빼는 것을 막기 위해서입니다.)

## `npm run verify` (`tools/verify.mjs`)

```
node tools/verify.mjs [--only V2,V9] [--jobs N] [--sims-dir build/bsshs-theme] [--site-dir dist]
                      [--report build/verify/report.json] [--names-file <파일>] [--cases <id>=<cases.json>]
                      [--style-done data/style-done.json] [--baseline-dir <고정본 폴더>]
```

- `--only`: `V1,V2,V3,V4,V5,V6,V9,V10a,V10b,V10c,V11,V12,TEST` 중에서 고릅니다. `V10`은 a·b·c 셋, `TEST`는 `npm test` 전체입니다.
- `--jobs`: 동시에 여는 브라우저(Chrome) 작업 수. 기본은 `CPU 수 − 4`와 12 중 작은 값.
- `--names-file`: 실명 목록(기본 `~/.config/bsshs-physics-sims/private-names.txt`, 환경변수 `BSSHS_PRIVATE_NAMES`). 이 파일은 저장소에 넣지 않습니다.
- `--cases <id>=<파일>`: 그 시뮬레이션의 V3 사례 파일을 바꿔 씁니다(새 사례를 미리 돌려 보거나, 제외 규칙을 시험할 때). 쓰면 보고서의 V3 메모에 남습니다.
- `--style-done`: V11이 읽는 완료 목록(기본 `data/style-done.json`). `--baseline-dir`: V12의 고정본 폴더(기본 `$BSSHS_CACHE/layout-baseline`).

### 각 항목

| 항목 | 무엇을 확인하나 | 어떻게 |
|---|---|---|
| **V1 빌드** | 68개(PhET 63 + 새 5)가 모두 한국어 단일 파일 HTML로 빌드되고 사이트에 올라갔는지. 개수가 68이 아니면 실패 | 빌드 기록이 성공이고, **지금의** 디자인 토큰·패치 규칙·용어 교정·그 시뮬레이션의 색 파일과 그림으로 만든 것(시뮬레이션마다 계산한 `themeHash` 일치, 새 시뮬레이션은 `sims/` 소스 해시도 일치), 파일 크기가 기록과 같음(빌드 뒤 손대지 않음), 첫 `<html lang="ko">`, 다른 파일을 부르는 `<script src>`/`<link href>` 없음, 서랍이 들어 있지 않음(V9 비교 기준이므로), `dist/sims/<id>.html` 있음 |
| **V2 check-sim** | 68개 × (데스크톱 1280, 휴대폰 390) = 136번 | `tools/check-sim.mjs`를 **사이트 파일**(`dist/sims/<id>.html`, 시험 범위는 서랍 포함)에 실행: 잡히지 않은 오류 없음, 「부산과학고」 워드마크, PhET 로고 없음, About 출처 6개, 다른 곳 요청 0건, 출처 밖 "PhET" 없음, 글꼴. 사이트 파일을 열기 때문에 V6의 「링크가 열린다」도 여기서 확인됩니다 |
| **V3 물리 검사** | 시험 범위 14개의 자동 물리 사례, 그리고 **근사 차이를 정한 항목에 「참고」 note가 있는지** | (1) 빌드에 서랍을 새로 넣은 사본(`build/verify/injected/<id>.html`, 사이트와 같은 도구·같은 데이터)에 `tools/run-cases.mjs`. 허용 오차는 사례에 적힌 값, 없으면 **상대 1%**(기본값 그대로). (2) 정적 검사 `toleranceNoteProblems`: 사례 파일에서 `relTol`이 기본값(0.01)보다 큰 측정 항목마다, 그 키를 `variables`에 가진 `data/lessons/<id>.json`의 공식에 「참고」로 시작하는 `note`가 있어야 합니다(연결 규칙은 drawer.md). 없으면 그 시뮬레이션의 V3 실패 |
| **V4 서랍 기록** | 기록이 새로 고침 뒤에도 남는지, 「모두 초기화」가 기록을 안 지우는지, 「새 실험 시작」, 화면 바꿈, CSV BOM, 그래프, 정의 버전 올림 | `npm test` 중 이름이 `V4`로 시작하는 테스트, `real build:` 테스트, `tests/drawer/core.test.mjs` |
| **V5 확인 상태·해시** | 세 상태 표시, 해시가 다르면 「확인 중」, 해시 범위 | `npm test` 중 `V5…` 테스트, `tests/drawer/hash·status.test.mjs`, `tests/status/` |
| **V6 목록 사이트** | 68개 링크, 시험 범위 14개 강조·배지, 바닥글 출처와 「학생 제작·공식 아님」, 실명 0건, 390px 가로 넘침 없음 등 | `tests/site/*.test.mjs`를 `BSSHS_SITE_DIR=dist`로 실행 + `index.html`에 카드 68개·시험 칸 14개인지 직접 셈(+1) |
| **V9 닫힌 서랍** | 14개 × (1280, 390): 서랍을 닫아 둔 화면이 서랍 없는 빌드와 픽셀까지 같은지(열기 버튼만 제외) | `tools/compare-layout.mjs <서랍 사본> <빌드> --all-screens --pause-clock --seed-random --exclude-button` |
| **V10a 디자인 값** | 색·글꼴 이름이 `theme/tokens.json` 밖에 없음 | `tests/theme/no-literals.test.mjs`, `tests/drawer/literals.test.mjs`, `tests/theme/tokens.test.mjs` |
| **V10b 패치 허용 목록** | 패치가 허용된 파일만 건드림(invariant 9: 비시험 54개는 테마·브랜드·한국어 문자열·외부 통신 끄기만) | 아래 「V10b」 |
| **V10c 실명 검색** | 실명 목록의 한 줄 한 줄이 빌드 68개, 사이트 전체, 저장소 추적 파일 어디에도 없음 | 아래 「V10c」 |
| **V11 화면 팔레트** | `data/style-done.json`에 든 시뮬레이션의 안쪽이 토큰 팔레트만 쓰는지: 장면 그래프의 칠·선 색, 그라데이션, 원본 그림, 화면 픽셀 비율, 글자 대비 4.5:1 | 목록의 시뮬레이션마다 `tools/check-style.mjs`(아래 「V11」). 목록이 **잘 만든 빈 배열**이면 0/0으로 통과, 파일이 없거나 형식이 틀리면 실패 |
| **V12 배치 불변** | 68개 모두 모든 화면에서 요소의 위치·크기가 디자인을 바꾸기 전의 고정본과 같은지(0.5px 안) | 시뮬레이션마다 `tools/compare-bounds.mjs`(아래 「V12」). 고정본이 없으면 실패 |
| **TEST** | `npm test` 전체 | 위 V4·V5·V6·V10a와 같은 한 번의 실행(사이트 폴더 지정) |

#### V10b 패치 허용 목록

`tools/lib/verify-core.mjs`의 `PATCH_ALLOWLIST`가 종류마다 건드려도 되는 「저장소 + 파일 모양」을 적은 목록입니다. 패치 규칙 목록과 **따로** 적었기 때문에, 규칙이 시뮬레이션 저장소·모델 코드·다른 부품 파일로 벗어나면 걸립니다.

- `telemetry`: `phetcommon` 통계 스크립트, `joist` 업데이트 확인, `chipper` `initialize-globals`
- `brand`: `brand/adapted-from-phet/`의 `Brand`와 그림 파일, `joist`의 메뉴 버튼 이름 문자열(`joist-strings_en.json`, `JoistA11yStrings.js`, `PhetButton.js`), babel의 `joist/joist-strings_ko.json`
- `theme`: `scenery-phet` `PhetFont`, `joist` `LookAndFeel`·`HomeScreen`, `sun`의 `ColorConstants`·`Panel`·`Checkbox`·슬라이더 손잡이
- `terms`: babel의 `<저장소>/<저장소>-strings_ko.json`만
- `sim-color`: `babel`·`chipper`·`perennial-alias`·`brand`가 아닌 저장소의 `js/` 아래 `.js`·`.ts`
- `art`: 같은 저장소 조건에서 `images/`·`mipmaps/` 아래 `*.png`, `*_png.js`, `*_png.ts`, `license.json`
- 모든 종류에 공통: 경로에 `model/`이 든 파일은 거절(`PATCH_DENY`)

검사하는 것은 세 가지입니다. (1) `ALL_RULES`의 모든 규칙과 시뮬레이션 68개 각각의 용어 교정 규칙(`termFixRules`, 고정된 번역 원본에서 계산)·색 규칙·그림 규칙(`simRulesFor`)이 **적어 둔 후보 파일 전부**, (2) 빌드 기록(`patches`)에 적힌 **실제로 고친 파일**(시뮬레이션마다), (3) 빌드 설정 덧대기(`overlays`)가 문서에 적힌 두 가지(`supportedBrands` 한 줄, `chipper-skip-tsc`)뿐인지와, 빌드 뒤 체크아웃이 깨끗한지(`trackedChangesAfterBuild` 빈 배열). 시험 범위 시뮬레이션의 서랍은 빌드 뒤 HTML에 넣으므로 패치가 아니며, 여기서는 다른 시뮬레이션과 같은 규칙으로 검사됩니다.

#### V10c 실명 검색

- 목록 파일의 줄마다 앞뒤 공백을 빼고, 2글자 미만과 `#`으로 시작하는 줄은 뺍니다(`tests/site`의 검사와 같은 규칙).
- 한 이름을 여러 모양으로 찾습니다: UTF-8(NFC, NFD), 자바스크립트 `\uXXXX`(대·소문자), HTML 숫자 문자 참조(`&#…;`, `&#x…;`). 빌드된 HTML은 한글을 이 모양들로 담기 때문입니다.
- 대상: 빌드 68개, `dist/` 아래 모든 파일(썸네일 포함), `git ls-files`의 모든 파일. 내용이 같은 파일(예: 사이트에 그대로 복사된 빌드)은 한 번만 읽고, 걸리면 먼저 읽은 파일 이름으로 보고합니다.
- 보고서와 화면에는 **파일 이름과 건수만** 나옵니다. 이름도, 몇 번째 줄인지도 쓰지 않습니다. `목록 지문`(이름 목록의 해시 앞 12자리)으로 같은 목록으로 돌렸는지만 비교할 수 있습니다.

#### V11 화면 팔레트

- 대상: `data/style-done.json`(시뮬레이션 id 배열). 처음엔 `[]`이고, 안쪽 디자인을 끝낸 시뮬레이션을 하나씩 더합니다. 마지막 단계에서는 68개 전부여야 합니다.
- **빈 목록을 어떻게 세나**: `npm run verify`가 「확인한 것이 0개면 실패」인 규칙(위 「보고서 읽기」)을 그대로 두면서, 목록 파일이 **잘 만든 빈 배열**일 때만 `0/0 통과`로 셉니다(확인할 시뮬레이션이 아직 없다는 뜻). 파일이 없거나, 읽을 수 없거나, 배열이 아니거나, 같은 id가 두 번이거나 68개에 없는 id가 있으면 실패입니다.
- 시뮬레이션마다 `tools/check-style.mjs <빌드> --id <id> --quiet`를 돌립니다(동시에 최대 8개). 끝 코드 0 = 열린 지적 0건 + 문제 0건. 기준값은 모두 토큰입니다: `sim.check.outsideShareMax`(팔레트 밖 픽셀 비율), `sim.check.minContrast`(4.5), `sim.check.paletteTolerance`, `sim.check.maxExceptions`(20).
- 예외(`theme/sim-styles/<id>.json`의 `exceptions`)는 이유와 `approvedBy`가 있는 것만 지적을 면제합니다. 승인자가 없으면 면제되지 않고 문제로도 셉니다. 21건째부터는 실패입니다.
- 보고서의 V11 `details`에 시뮬레이션마다 보기 수, 열린 지적 수, 예외로 넘긴 수가 들어갑니다.

#### V12 배치 불변

- 디자인을 바꾸기 전에 `node tools/compare-bounds.mjs --freeze`로 68개를 고정본으로 떠 둡니다(한 번만, 덮어쓰려면 `--force`). 위치는 `$BSSHS_CACHE/layout-baseline/`이고 저장소에는 넣지 않습니다.
- 시뮬레이션마다 `tools/compare-bounds.mjs <id> --sims-dir <빌드 폴더> --baseline-dir <고정본 폴더>`를 돌립니다(동시에 최대 8개). 두 파일을 같은 반복 가능한 시간 흐름으로 열어 모든 화면의 노드 상자를 비교합니다. 하나라도 다르거나, 화면 수가 다르거나, 비교한 노드가 0개면 그 시뮬레이션이 실패입니다.
- 새 시뮬레이션 5개도 같은 방식으로 고정본과 비교합니다.

### 제외 규칙 (사양 3.5·3.6, 불변 규칙 6)

V3에 실패한 기능은 공개 빌드에서 빠집니다. 종류가 둘입니다(`exclusions.json`의 `kind`):

- `sim`: **새 시뮬레이션**(`sims/<id>`)이 실패하면 그 시뮬레이션을 통째로 뺍니다. verify가 `site/build-site.mjs --exclude <id> --thumbs`로 `dist/`를 다시 만들고, 그러면 V1의 개수가 68보다 작아져 **V1도 실패**합니다(조용히 통과하지 않음).
- `drawer`: **시험 범위 PhET 시뮬레이션**이 실패하면 수업 서랍만 뺍니다. verify가 `site/build-site.mjs --no-drawer <id> --thumbs`로 `dist/`를 다시 만들어, 그 시뮬레이션은 서랍 없는 일반 학교판(테마 빌드 그대로)으로 공개됩니다. 시뮬레이션은 계속 공개되므로 V1 개수는 줄지 않지만, **V3는 그대로 실패로 보고**됩니다.

두 경우 모두 `build/verify/exclusions.json`에 이유를 적습니다. 이미 서랍이 빠진 사이트는 다시 만들지 않습니다.
`--only`에 V3가 없으면 마지막 V3 실행의 `exclusions.json`을 V1이 그대로 씁니다. 고친 뒤에는 `npm run build-everything`으로 사이트를 다시 만들고 V3를 포함해 다시 검증하세요.

### 실행 순서와 시간

1. 서랍 사본 만들기 → V3·V9 브라우저 작업(같은 작업 풀, V3 먼저)과 V10b(정적)를 함께
2. 제외 규칙 적용(필요할 때만 사이트 다시 만듦)
3. V1, V10c, V2(136번, 같은 풀)
3b. V11(완료 목록), V12(68개), 각각 최대 8개씩 동시에
4. `npm test` 한 번(V4·V5·V6·V10a·TEST). 테스트가 브라우저를 많이 쓰므로 V2가 끝난 뒤에 돌립니다.

### 보고서 읽기

화면에는 항목마다 한 줄이 나옵니다: `통과  V2   check-sim 136/136`. 실패면 `— 실패 N건: <id> <폭> <이유>`가 붙고, 그 아래에 메모가 들여 쓰여 나옵니다. 끝 줄은 `모두 통과` 또는 `실패: V1, V3` · 걸린 시간 · 보고서 위치입니다.

`build/verify/report.json`(schemaVersion 1):

```json
{ "tool": "verify", "schemaVersion": 1, "startedAt": "…", "ms": 0, "selected": ["V1", "…"], "ok": true, "failed": [],
  "exclusions": [ { "id": "bsshs-…", "kind": "sim", "reason": "…" }, { "id": "generator", "kind": "drawer", "reason": "…" } ],
  "checks": [ { "id": "V2", "name": "check-sim", "ok": true, "exitCode": 0, "passed": 136, "total": 136,
                "failures": [ { "id": "<sim>", "width": 390, "error": "…" } ], "notes": [], "ms": 0, "details": [ … ] } ] }
```

- 항목은 끝 코드 0, 실패 0건, 그리고 **센 것이 1개 이상**이고 모두 통과일 때만 통과입니다. 아무것도 확인하지 못한 항목(파일 없음, 테스트 건너뜀)은 실패입니다. V4·V5·V6·V10a에 속한 테스트가 건너뛰어지면 그 항목은 실패입니다.
- `details`: V2는 실행마다 `exitCode`·`ms`·`error`, V3는 시뮬레이션마다 사례 수와 허용 오차, V9는 화면 수와 서로 다른 화면 그림 수(`distinctShots`).
- 각 도구의 원래 출력이 필요하면 같은 명령을 직접 실행하세요(예: `node tools/check-sim.mjs dist/sims/<id>.html --width 390`).

## 알려진 한계

- V2는 시작 화면·메뉴·About 창만 훑습니다. 설정 창·키보드 도움말 창의 색은 V11이 열어서 봅니다.
- V11은 「팔레트 안에 있다」까지만 압니다. 보기 좋은지는 `tools/style-review.mjs`의 대조표를 사람이 봐야 합니다. 상호작용 뒤에만 나타나는 색(전구가 켜질 때 등)과 이름공간에 등록되지 않은 클래스의 이름은 못 봅니다.
- V12는 선 두께를 뺀 도형 상자를 비교하므로 선 두께만 바뀐 것은 못 잡습니다(두께가 이웃의 배치를 밀면 이웃의 위치 변화로 잡힙니다). 기준점(코일 도선 끝점 같은 것)이 같은 크기 안에서 어긋나는 것도 못 봅니다.
- V3는 사례 파일에 적힌 상태만 확인합니다. 사례가 덮지 않는 화면·값은 확인하지 않습니다.
- V9의 `--pause-clock`은 처음 화면 다음부터 시계를 멈추고 찍습니다. 시간이 흐르며 생기는 차이는 비교하지 않습니다. `--seed-random`은 두 파일의 난수를 같게 맞춥니다.
- V10b의 허용 목록은 「어느 파일을 건드리나」를 봅니다. 허용된 파일 **안에서** 무엇을 바꾸는지는 패치 규칙 단위 테스트(`tests/theme/patches.test.mjs`)와 `theme/patches/dry-run.mjs`가 봅니다.
- V10c는 목록에 적힌 글자 그대로만 찾습니다(띄어쓰기를 바꾼 모양, 이미지 속 글자는 찾지 못함).
- 헤드리스 Chrome은 창 폭 500px 아래로 배치하지 않아서, 390px은 CDP 기기 화면 흉내로 엽니다(check-sim과 같은 방법).

## 허용 오차·플래그

이 작업에서 바꾼 허용 오차나 검사 플래그는 없습니다. V3는 `run-cases`의 기본값(상대 1%, 0 기대값은 절대 1e-9)과 사례 파일에 적힌 값을 그대로 쓰고, V9는 `--max-diff-pixels 0`, `--tolerance 0`(기본값)입니다. 앞으로 바꾸면 이유를 이 절에 적습니다.

## 실제로 돌려 본 결과 (2026-11-04, 32코어 맥)

- `npm run build-everything`: 처음(63 + 5 다시 빌드) 약 6분 30초, 바뀐 것이 없을 때 약 1분 50초(대부분 썸네일). 두 번째 실행 뒤 빌드 기록 세 파일은 바이트까지 같았습니다.
- `npm run verify`(전체): 약 7분. V2 136번 약 3분, V3·V9 함께 약 1분 30초, `npm test` 약 1분 50초.
- 검사가 진짜로 잡는지 일부러 고장 내 확인했습니다(확인 뒤 원래대로 돌림):
  - V10b: 빌드 기록 한 줄에 「`theme-panel`이 `sun/js/model/…`을 고쳤다」고 바꾸면 V10b만 실패(67/68).
  - V10c: `dist/`에 실명 하나가 든 파일을 두면 V10c만 실패(파일 이름과 1건만 보고, 이름은 출력에 없음).
  - 제외 규칙: `--cases bsshs-laser=<값 하나를 5% 바꾼 사례 파일>`이면 V3 실패 → 사이트에서 레이저를 빼고 다시 만듦 → V1 67/68 실패. V10b·V10c는 통과.

## 안쪽 디자인 검사(V11·V12)를 돌려 본 결과 (2026-11-05, 32코어 맥)

- `node tools/compare-bounds.mjs --freeze`로 68개를 고정본으로 떴습니다. 같은 날 빌드 폴더와 비교한 `verify --only V12`는 68/68(화면 200개, 노드 29,393개, 다른 노드 0개)이었고 두 번 연속 같은 개수가 나왔습니다. 동시 8개로 약 3분(174초, 181초). 시뮬레이션 하나는 보통 10~25초이고 wave-interference·buoyancy·waves-intro 같은 무거운 것도 30초 안쪽입니다.
- 첫 시도에서 장면 그래프를 `getSelfShape()`로 훑었더니 wave-interference 한 화면에 24초, buoyancy에서는 탭이 죽었습니다. `getShape()`로 바꾸자 같은 값(118개 노드 모두 같은 상자)에 거의 시간이 들지 않았습니다.
- 반복 가능한 시간 흐름 확인: wave-on-a-string을 같은 파일로 두 번 비교해 두 번 다 통과, 노드 161개로 같았습니다.
- 서로 다른 시뮬레이션을 비교하면(faradays-law 고정본과 generator 빌드) 다른 노드 227개로 실패합니다.
- V11: `data/style-done.json`이 `[]`이면 0/0 통과, `["faradays-law"]`이면 열린 지적 33건으로 실패, 파일이 없거나 배열이 아니면 실패합니다. faradays-law의 실제 지적(`check-style`, 화면 1개 + 키보드 도움말 창): 칠·선 색 212건(그룹 33건 안), 그라데이션 5건, 원본 그림 10건, 팔레트 밖 픽셀 86.0%(기준 3%).
- 안쪽 디자인 규칙을 하나 만들어 끝까지 시험했습니다(시험 뒤 되돌림): faradays-law에 색 규칙 4개와 코일 그림 2장(`mipmaps/two-loop-*.png`, 318×468)을 임시로 연결하자 규칙 29개 중 25개가 적용된 빌드가 됐고, 코일 그림 2장이 「원본 그림」 지적에서 빠졌으며, V12는 같은 크기라 통과했습니다. 같은 시험에서 바꾸지 않은 새 시뮬레이션은 「이미 빌드됨」으로 건너뛰었고, 색 규칙이 모델 파일이 아닌 곳에서 못 찾는 글자를 가리키면 빌드가 멈추고 `dry-run`이 같은 문제를 미리 보여 줬습니다.
- 해시 정의가 바뀌었으므로 기존 빌드 기록의 `themeHash`는 모두 낡았습니다. `npm run build-everything`을 한 번 돌리기 전에는 V1이 시뮬레이션마다 「themeHash 다름」으로 실패합니다(2026-11-05에는 시험으로 다시 빌드한 faradays-law와 bsshs-photoelectric 2개만 통과).
