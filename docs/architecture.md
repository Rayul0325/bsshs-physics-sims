# 시스템 구성

이 프로젝트는 실행 중인 서버가 없다. 관리자 컴퓨터에서 도는 Node 빌드 도구가 정적 파일 묶음(`dist/`)을 만들고, 그 묶음을 Cloudflare Pages에 올린다. 학생 브라우저는 파일을 받기만 하고, 그 뒤의 모든 동작(시뮬레이션, 서랍, 기록, 내보내기)은 브라우저 안에서 끝난다.

## 큰 흐름

```
GitHub phetsims/<id> (release 브랜치, 읽기만)
   │ tools/fetch-sources.mjs  (git bare 미러 + 시뮬레이션별 매니페스트)
   ▼
~/.cache/bsshs-physics-sims  (저장소 밖 캐시: mirrors/, manifests/, slots/slot-N/, npm-cache/, bsshs-wordmark/)
   │ tools/build-sim.mjs / build-all.mjs   (PhET 63개)
   │ tools/build-new-sim.mjs               (sims/<id> 5개, newSimBase 부품 묶음)
   │   슬롯 체크아웃 → 패치 규칙 적용(theme/ + brand/ + 용어 교정) → chipper grunt 빌드
   │   → 패치 되돌림 → HTML 머리에 테마·브랜드 묶음 삽입(theme/inject.mjs)
   ▼
build/bsshs-theme/<id>/<id>_ko.html  (68개, 서랍 없는 단일 HTML)  +  data/build-matrix*.json (빌드 기록)
   │ site/build-site.mjs
   │   시험 범위 14개: drawer/inject.mjs로 서랍 넣기(adapters/<id>/ + data/lessons/<id>.json
   │                   + data/verification-status.json + 물리 내용 해시)
   │   나머지: 그대로 복사 / 썸네일 촬영 / 글꼴 복사 / index.html 생성
   ▼
dist/  (index.html, sims/<id>.html, thumbs/<id>.png, fonts/*)
   │ tools/verify.mjs  (dist/와 build/를 검사, build/verify/report.json)
   │ npx wrangler@4 pages deploy dist
   ▼
Cloudflare Pages  https://bsshs-physics-sims.pages.dev  ──GET──▶  학생 브라우저
```

공개 소스 저장소는 이 흐름과 따로 간다: 이 저장소의 추적 파일만 `git archive HEAD`로 저장소 밖 내보내기 폴더에 풀고, 거기서 새 기록으로 GitHub `Rayul0325/bsshs-physics-sims`에 올린다.

## 대표 흐름 1: PhET 시뮬레이션 하나를 학교판으로 빌드

1. `data/sims.json`에서 id의 release 브랜치와 기대 버전을 읽는다. 매니페스트(캐시의 `manifests/<id>.json`)에는 그 브랜치의 `dependencies.json`에 고정된 형제 저장소 SHA와 골라 둔 `babel` SHA가 있다.
2. 빈 슬롯(`slots/slot-N/`, 잠금 파일 `.lock`)을 잡고, 시뮬레이션과 형제 저장소(chipper, joist, scenery, sun, babel …)를 고정 SHA로 강제 체크아웃한다. 그 시뮬레이션에 필요 없는 폴더는 `.parked/`로 비켜 둔다.
3. 패치 규칙을 적용한다. 규칙은 항상 커밋된 원본(`git show HEAD:<파일>`)을 변환해 덮어쓰고, 바뀐 파일 목록을 쓰기 전에 기록한다. 종류는 `telemetry`(통계·업데이트 확인 끄기), `brand`(`brand/adapted-from-phet/` 안을 학교 표기로 교체, 메뉴 버튼 이름), `theme`(PhET 공통 부품의 기본 색·글꼴을 토큰 값으로), `terms`(babel 한국어 문자열 값 치환).
4. chipper 세대에 맞는 인자로 `grunt build --brand(s)=adapted-from-phet --locales=ko --lint=false`를 돌린다. 실패 원인이 알려진 두 가지(지원 브랜드 목록, 비공개 PhET-iO 타입 검사)이면 빌드 설정만 임시로 덧대 다시 빌드한다.
5. 모든 패치·덧대기를 `git checkout --`으로 되돌리고, 형제 저장소가 깨끗한지 `git status`로 확인해 기록한다.
6. 결과 HTML의 `<meta charset>` 바로 뒤에 `<!-- bsshs:begin -->` 묶음(브랜드 메타, 워드마크 지문, OFL 주석 + 글꼴 data URI + `--bsshs-*` 변수, 글꼴 미리 불러오기 스크립트)을 넣어 `build/bsshs-theme/<id>/<id>_ko.html`에 쓴다.
7. 성공·실패, 쓴 SHA, `themeHash`(토큰 + 규칙 + 출처 문구 + 용어 교정), 패치 결과, 출력 크기를 `data/build-matrix.bsshs-theme.json`에 한 줄로 남긴다. 다음 실행은 이 줄과 출력 파일이 맞으면 건너뛴다.

새 시뮬레이션은 2단계 대신 `sims/<id>/`를 슬롯 안에 복사해 고정 작성자·시각으로 한 번 커밋하고(같은 소스면 같은 SHA), 한국어 문자열 파일을 슬롯의 `babel/<id>/`에 임시로 넣는다. 부품은 63개 중에서 고른 한 묶음(`newSimBase`: energy-skate-park-basics 1.5.0, chipper 2.0.0, Node 24)만 쓴다. chipper가 이 브랜드에서 타입 검사를 건너뛰므로 빌드 도구가 `tsc -b`를 따로 돌린다. 기록은 `data/build-matrix.new-sims.json`.

## 대표 흐름 2: 학생이 시험 범위 시뮬레이션에서 측정을 기록

1. 학생이 `https://bsshs-physics-sims.pages.dev/`에서 카드를 누른다. 링크는 `sims/<id>.html`이고 Pages가 `/sims/<id>`로 308 이동시킨다.
2. 받은 HTML 한 파일 안에 시뮬레이션, 글꼴, 테마 변수, 서랍 코드(`core.js`, `runtime.js`), 서랍 데이터(측정 정의, 공개 필드만 남긴 수업 내용, 빌드 때 계산한 확인 상태와 해시), 어댑터가 모두 들어 있다. 추가 요청은 없다.
3. 서랍 런타임은 PhET가 화면을 다 만들고 시작 화면이 사라진 뒤 shadow DOM 호스트를 붙인다. 서랍 안에서 시작한 포인터·키·휠·포커스 이벤트는 시뮬레이션으로 전달되지 않는다.
4. 서랍이 열려 있는 동안 런타임이 어댑터의 `read()`를 토큰의 `drawer.liveRefresh` 간격(지금 0.5초)마다 불러 현재 값을 보여 준다. 어댑터는 `phet.joist.sim.screens[i].model`의 Property를 읽는다.
5. 「기록」을 누르면 시각·화면 이름·측정값 한 줄이 `localStorage`의 `bsshs:log:<id>:v<schemaVersion>`에 저장된다. 저장할 수 없는 브라우저에서는 메모리에만 둔다.
6. CSV·PNG 내려받기는 브라우저 안에서 Blob을 만들어 저장시킨다. 서버로 가는 것은 없다.

## 모듈과 의존 방향

| 모듈 | 하는 일 | 의존하는 곳 | 의존받는 곳 |
|---|---|---|---|
| `data/` | 고정 시뮬레이션 목록, 시험 범위, 수업 내용, 단원, 제목, 용어 교정, 확인 상태, 빌드 기록 | 없음(데이터) | 모든 모듈 |
| `theme/` | 토큰 읽기·검사·변환, 패치 엔진, 테마·외부 통신·용어 규칙, HTML 머리 삽입, 패치 미리보기 | `brand/`(규칙·출처 문구), `tools/lib/`(경로, 고정 번역표) | `tools/`, `drawer/`, `site/`, `brand/` |
| `brand/` | 워드마크 PNG·시작 화면 SVG 생성, 출처 문구와 저장소 주소, 브랜드 패치 규칙 | `theme/index.mjs`(토큰), `tools/lib/paths.mjs`(캐시) | `theme/patches/index.mjs`, `site/`, `tools/check-sim.mjs` |
| `drawer/` | 서랍 런타임·순수 계산·CSS, 주입기, 물리 내용 해시, 확인 상태 해석 | `theme/index.mjs`, `data/`, `adapters/`(주입 대상) | `site/`, `tools/`(주입·검사·확인 기록) |
| `adapters/` | 시험 범위 시뮬레이션마다 측정 정의, 연결 코드, 물리 검사 사례 | 실행 때 전역 `bsshsDrawer`만 | `drawer/inject.mjs`, `tools/run-cases.mjs` |
| `sims/` | 새 시뮬레이션 5개와 틀 | 슬롯 안 PhET 부품(`newSimBase`)만, 저장소 코드는 가져오지 않음 | `tools/build-new-sim.mjs` |
| `site/` | 목록 사이트 생성, 사이트 CSS | `theme/`, `drawer/`(해시·상태), `brand/`(출처 문구), `tools/inject-drawer.mjs`(자식 프로세스) | `tools/build-everything.mjs`, `tools/verify.mjs` |
| `tools/` | 받기·빌드·검사·검증·확인 기록 명령과 공용 라이브러리(`tools/lib/`) | 위 전부 | 사람(npm 스크립트) |

`theme/`·`brand/`·`tools/lib/`는 서로를 가져온다(패치 목록이 브랜드 규칙을, 워드마크가 토큰과 캐시 경로를, 용어 규칙이 고정 번역표 읽기를 쓴다). 런타임 코드(`drawer/core.js`, `drawer/runtime.js`, `adapters/*/adapter.mjs`)는 HTML에 인라인되므로 아무것도 import하지 않는다.

## 경계에서 오가는 것

- **학생 브라우저 ↔ Cloudflare Pages**: 정적 파일 GET만. 기록, 이름, 사용 통계는 어디로도 보내지 않는다. 로그인, 쿠키, 분석 스크립트가 없다.
- **빌드 컴퓨터 ↔ GitHub `phetsims`**: 읽기(미러 갱신)만. 받은 소스는 저장소 밖 캐시에 있고 커밋하지 않는다. PhET-iO 저장소는 비공개라 받을 수 없으며, 이 빌드에 쓰이지 않는다.
- **빌드 컴퓨터 ↔ 공개 GitHub 저장소**: 내보내기 폴더에서 push만. 이 저장소의 기록과 gitignore된 폴더(`build/`, `dist/`, `sources`, 로컬 작업 문서)는 넘어가지 않는다.
- **수업 녹음 기록(저장소 밖)**: 사람이 읽어 수업 공식·용어를 정리할 때만 쓴다. 저장소에는 녹음 식별자(날짜·교시·짧은 해시)만 `data/lessons/*.json`의 `sources`에 남고, 이 필드도 서랍 HTML에는 들어가지 않는다.
- **BSS Drive(저장소 밖 디자인 원천)**: 토큰 값을 처음 정할 때 읽었다. 빌드는 BSS Drive를 읽지 않는다.

## 외부 의존

- Node 24 이상(`package.json`의 `engines`), git, 설치된 Google Chrome(Playwright가 `channel: 'chrome'`으로 씀, 브라우저 내려받기 없음), `playwright` 하나(devDependency).
- PhET 빌드 도구(chipper, grunt-cli 1.4.3)는 캐시에 받아 쓴다. 다른 Node 버전이 필요하면 `fnm`.
- Cloudflare Pages(배포), `npx wrangler@4`(설치하지 않고 실행).
- GitHub(PhET 소스 받기, 공개 저장소 push).
