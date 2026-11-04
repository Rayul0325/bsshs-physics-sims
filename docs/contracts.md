# 외부에 약속한 것

이 프로젝트의 소비자는 셋이다: 사이트를 여는 학생·선생님(주소와 내려받은 파일), 학생 브라우저에 남은 기록(저장 형식), 그리고 도구 출력을 읽는 사람과 `tools/verify.mjs`(CLI의 JSON과 종료 코드).

## 공통 약속

- 접근: 로그인·쿠키·API 키가 없다. 누구나 주소로 GET만 한다.
- 시뮬레이션 id는 영구 식별자다. 사이트 주소, 기록 저장 키, CSV·PNG 파일 이름, 확인 상태 항목, 어댑터 폴더가 모두 id로 묶인다. 공개한 id를 바꾸면 공유된 링크와 학생 기록이 끊긴다.
- CLI 종료 코드: `0` = 모두 통과/성공, `1` = 검사 실패(또는 형식이 틀린 입력 파일), `2` = 사용법·파일 없음·브라우저 실행 실패 같은 실행 오류. 예외는 아래 표에 적었다.
- 도구의 JSON 보고서에는 `schemaVersion`이 있다. 키를 지우거나 뜻을 바꾸지 않고 더하기만 한다. 바꿔야 하면 `schemaVersion`을 올리고 읽는 쪽(`tools/verify.mjs`)을 같이 고친다.

## 공개 사이트

주소 `https://bsshs-physics-sims.pages.dev` (Cloudflare Pages, 운영 브랜치 `main`).

| 경로 | 응답 | 비고 |
|---|---|---|
| `/` | 200, `index.html`. 제목 `부산과학고 물리 시뮬레이션`, 바닥에 출처 문구와 `부산과학고 학생 제작 · 학교 공식 자료 아님` | 카드 68개, 맨 위 시험 범위 칸 14개 |
| `/sims/<id>.html` | 308 → `/sims/<id>` | Pages의 확장자 없는 주소 규칙. 사이트 링크는 `.html`을 쓴다 |
| `/sims/<id>` | 200, 단일 HTML(모든 스크립트·글꼴·서랍 인라인). `<html lang="ko">` | 시험 범위 14개에는 서랍 묶음이 들어 있다 |
| `/thumbs/<id>.png` | 200, 640×400 PNG | 카드 썸네일 |
| `/fonts/<파일>` | 200, woff2와 OFL 라이선스 문서 | 목록 사이트 글꼴 |
| 그 밖의 주소 | **200**, 목록 페이지(`index.html`)와 같은 내용 | `404.html`이 없어 Pages가 단일 페이지 앱처럼 처리한다(2026-11-04 실제 주소로 확인). 없는 시뮬레이션 주소도 200이 나온다 |

- 시뮬레이션 페이지는 열린 뒤 어떤 주소로도 요청하지 않는다. 다른 사이트에 끼워 넣거나 오프라인으로 저장해도 동작한다(파일 하나로 열림).
- 공개 시뮬레이션 68개 = `data/sims.json`의 63개 + `sims/`의 새 시뮬레이션 5개. id 목록은 그 두 곳이 기준이다.

## 브라우저에 남는 기록

- 키: `localStorage['bsshs:log:<id>:v<schemaVersion>']`. 모든 시뮬레이션이 같은 origin을 쓰므로 id로 나눈다. `bsshs:probe`는 저장 가능 여부를 볼 때 잠깐 쓰고 지운다.
- 값(JSON 문자열): `{ "simId": "<id>", "version": <schemaVersion>, "measurements": [<drawer.json의 측정 항목>], "rows": [ { "time": "<ISO 시각>", "screen": "<한국어 화면 이름>", "values": { "<key>": <숫자 또는 null> } } ] }`. 줄이 0개면 키를 지운다.
- `schemaVersion`이 같으면 이 모양의 예전 기록을 그대로 이어 쓴다. 다른 버전의 키는 서랍을 열 때 「이전 기록 CSV 내려받기」/「받지 않고 지우기」 뒤 지운다.
- 오류 처리: 저장소를 쓸 수 없으면 메모리에만 두고 「이 브라우저에서는 기록을 저장할 수 없어 …」 안내를 띄운다. 값이 깨진 JSON이면 빈 기록으로 시작한다.

## 내려받는 파일

| 파일 | 이름 | 모양 |
|---|---|---|
| 측정 기록 CSV | `<id>-측정기록.csv` | UTF-8, 첫 바이트 BOM(`EF BB BF`), 줄 끝 CRLF. 머리 줄 `시각,화면,<이름 (단위)>…`, 수업 단위 변환이 있는 항목은 `<이름 (수업 단위)>` 열이 바로 뒤에 붙는다. 시각은 `YYYY-MM-DD HH:MM:SS`(기기 현지 시각), 숫자는 보통 표기(`6.667e-7`), 값이 없으면 빈칸. 쉼표·따옴표·줄 바꿈이 든 칸은 큰따옴표로 감싼다 |
| 이전 버전 기록 CSV | `<id>-측정기록-v<버전>.csv` | 위와 같은 모양, 예전 측정 정의 기준 |
| 그래프 PNG | `<id>-<그래프 id>.png`, 자유 그래프는 `<id>-free.png` | 토큰 `drawer.graph.pngWidth`×`pngHeight` 크기, 비어 있지 않은 PNG |

## 서랍 브라우저 API `window.bsshsDrawer`

어댑터와 검사 도구(`run-cases`, `compare-layout`, 테스트)가 쓰는 약속이다. 시험 범위 시뮬레이션 페이지에만 있다.

| 멤버 | 입력 | 출력 | 오류·주의 |
|---|---|---|---|
| `register(adapter)` | `{ simId, screenName?(), read(), apply?(params) }` | `true` / `false` | 한 번만 부른다. `simId`가 페이지와 다르거나 `read`가 함수가 아니면 콘솔 오류와 함께 `false`(등록 안 됨) |
| `read()` | 없음 | `{ <key>: number \| null }` (기록하지 않음) | 어댑터가 던지면 모든 값 `null` |
| `screenName()` | 없음 | 한국어 화면 이름(홈이면 「홈 화면」) | |
| `open(tab?)` / `close()` / `isOpen()` | `'log' \| 'graphs' \| 'lessons'` | | |
| `record()` / `rows()` / `clear()` | | 기록 한 줄 추가 / 줄 배열 / 확인 없이 비움 | `clear()`는 도구용. 화면의 「새 실험 시작」은 확인을 받는다 |
| `exportCsv()` | | CSV 문자열(BOM 포함) | |
| `exportPng(graphId \| 'free')` | | `Promise<Blob>` | |
| `fits(graphId)` | | `{ slope, intercept, r2, n }` 또는 `null`(서로 다른 x 2개 미만) | |
| `status()` / `hash()` | | `{ state, label, date, stale }` / 물리 내용 해시 | 빌드 때 계산한 값 |
| `legacy()` | | `[ { version, rows } ]` 예전 버전 기록 | |
| `layout()` / `buttonRect()` | | `{ mode: 'side' \| 'sheet', open }` / 열기 버튼 상자 | |
| `apply(params)` | 사례의 `params` | `Promise` | 어댑터의 `apply`. 자동 검사 전용 |
| `helpers` | | `sim()`, `screen()`, `model()`, `isHomeScreen()`, `screenName()`, `cleanName(s)` | joist 세 세대를 모두 처리 |
| `mounted` / `adapterRegistered` | | boolean | 서랍은 시뮬레이션 준비와 시작 화면이 끝난 뒤 `mounted`가 된다 |

## 관리 명령 (npm 스크립트)

| 명령 | 입력 | 출력 | 실패 |
|---|---|---|---|
| `npm run fetch-sources [-- --update] [id …]` | `data/sims.json` | 캐시의 미러·매니페스트, `fetched N/M` | 종료 코드 1(하나라도 실패), 2(예외) |
| `npm run build-sim -- <id> [--brand bsshs] [--theme] [--force] [--slot N] [--node 24,20] [--no-type-check] [--no-brand-overlay]` | 고정 소스 | `build/<variant>/<id>/<id>_ko.html`, 빌드 기록 한 줄 | 0이 아닌 종료 코드, 기록의 `success: false`·`error` |
| `npm run build-all -- [--jobs N] [--brand bsshs --theme] [--include-new \| --new-only]` | 위와 같음 | 여러 개 | 하나라도 실패면 0이 아님 |
| `npm run build-everything [-- --force] [--exclude id,…]` | | 빌드 68개, 정리된 빌드 기록, `dist/`. 마지막 줄에 「이 dist/는 아직 물리 검사(V3)를 거치지 않았다」는 주의 | 1(빌드나 사이트 실패, 시험 범위 파일 누락 포함), 2(예외) |
| `npm run build-site [-- --out dist] [--thumbs] [--exclude id,…] [--no-drawer id,…] [--allow-missing]` | `build/bsshs-theme/`. `--exclude` = 그 시뮬레이션을 사이트에서 뺌, `--no-drawer` = 시험 범위 시뮬레이션을 서랍 없는 학교판으로 공개 | `dist/` 전체(먼저 지움), JSON 한 줄 `{ out, sims, missing, excluded, noDrawer, thumbs }` | 종료 코드 1: 시험 범위 id의 필수 파일이 빠짐(`exam scope is incomplete … N missing item(s):` 뒤에 `<id>: missing <파일> (<경로>)` 줄을 전부 출력, 아무것도 쓰기 전), 빌드가 없는 시뮬레이션(`missing builds: …`), 서랍 주입 실패 |
| `npm run verify [-- --only V2,V9] [--jobs N] [--names-file f] [--cases <id>=<파일>]` | `build/`, `dist/`, 실명 목록 | 항목별 한 줄 + `build/verify/report.json` | 종료 코드 1(하나라도 실패), 2(인자 오류) |
| `npm run approve -- <id> [메모]` | 시험 범위 id | `<id>: 확인 완료 (날짜) hash <앞 12자리>…` | 시험 범위 밖 id·틀린 상태 파일 → 1, 인자 없음 → 2 |
| `npm run set-status -- <id> <확인 중\|수정 중> [메모]` | | `<id>: <상태> (날짜)` | `확인 완료`를 주면 거부(1) |
| `npm test` | | node:test 결과 | 하나라도 실패면 0이 아님 |

## 검사 도구 출력

| 도구 | 출력 | 종료 코드 |
|---|---|---|
| `tools/check-sim.mjs <html \| http(s) 주소> [--width W] [--height H] [--timeout 10000] [--settle 2000] [--shots 폴더] [--no-about] [--quiet]` | JSON 하나(`tool: "check-sim"`, `schemaVersion: 1`, `ok`, `viewport`, `checks.{ready,errors,wordmark,phetLogo,about,network,fonts,phetName}`, `screenshots`). 치명적 오류는 `{ tool, schemaVersion, target, ok: false, fatal }` | 0/1/2 |
| `tools/run-cases.mjs <서랍 넣은 html> <id> [--cases f \| --adapter-dir d] [--rel-tol 0.01] [--abs-tol 1e-9] [--settle 300] [--settle-timeout 5000]` | 사례마다 `{"type":"case","name","ok","settled","params","screen","results":[{"key","expected","actual","mode","tol","error","ok"}],"error","ms"}` 한 줄, 마지막에 `{"type":"summary","ok","passed","failed",…}` | 0/1/2(다른 시뮬레이션의 서랍이 든 파일도 2) |
| `tools/compare-layout.mjs <a.html> <b.html> [--width 1280] [--exclude-button] [--all-screens \| --first-screen] [--pause-clock] [--seed-random] [--max-diff-pixels 0] [--tolerance 0] [--diff out.png]` | JSON 하나: `diffPixels`, `totalPixels`(모든 화면 합), `screens[]`(`index`(-1 = 홈), `name`, `diffPixels`, `diffBox`, `excluded`, `ok`, `shotSha1`, `diffImage`) | 0 = 모든 화면이 허용 이하, 1 = 다름, 2 = 오류 |
| `tools/inject-drawer.mjs <built.html> <id> [--out f] [--adapter-dir d] [--lessons f] [--status-file f]` | 대상 파일을 고쳐 쓰고 JSON 한 줄 `{ tool, file, simId, schemaVersion, status, hash }` | 0, 1(필수 파일 네 개 중 빠진 것 전부, 또는 형식 오류 목록 출력), 2(사용법) |
| `build/verify/report.json` | `{ tool: "verify", schemaVersion: 1, startedAt, ms, selected, ok, failed, exclusions: [{ id, kind: "sim" | "drawer", reason }], checks: [{ id, name, ok, exitCode, passed, total, failures, notes, ms, details }] }` | — |

verify의 항목 판정: 종료 코드 0, 실패 0건, 센 것 1개 이상일 때만 `ok`. 아무것도 확인하지 못한 항목은 실패다. V10c의 `failures`에는 파일 이름과 건수만 있고 이름은 없다. `exclusions`의 `kind`: `sim` = 새 시뮬레이션을 사이트에서 뺌(V1 개수가 줄어듦), `drawer` = 변형 시뮬레이션을 서랍 없이 공개(V1 개수 그대로). `kind`가 없는 옛 기록은 `sim`으로 읽는다. V3 실패 사유에는 사례 실패와 함께 「참고」 설명이 없는 넓힌 허용 오차(`근사 차이 <key> …`)가 나올 수 있다.
