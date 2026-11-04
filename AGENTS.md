# 부산과학고 물리 시뮬레이션 (학생 제작판)

부산과학고 「전자기와 양자」 수업에서 쓰는 물리 시뮬레이션 정적 사이트다. PhET HTML5 시뮬레이션 63개를 PhET 공개 release 브랜치 소스로 다시 빌드해 학교 디자인을 입힌 것, PhET MIT 부품으로 새로 만든 시뮬레이션 5개(`sims/bsshs-*`), 기말 시험 범위 14개에만 붙는 「수업 서랍」, 목록 사이트로 이루어진다.
학생 한 명이 만들고 관리하며 학교 공식 자료가 아니다. 서버·계정·데이터베이스가 없고, 학생의 기록은 각자 브라우저에만 있다. 빌드 도구는 Node 스크립트, 배포는 Cloudflare Pages, 소스는 GPL-3.0 공개 저장소다.

## 프로젝트 구조

```
.
├── CLAUDE.md / AGENTS.md          → 프로젝트 개요·절대 규칙·작업 전 읽을 곳(두 파일은 내용이 같다)
├── docs/
│   ├── architecture.md            → 구성 요소, 빌드·사이트·배포 흐름, 모듈 의존 방향
│   ├── business-rules.md          → 시험 범위, 측정 기록, 공식·용어, 확인 상태와 해시, 용어 교정 규칙
│   ├── security.md                → 개인정보·외부 통신·자격 증명·공개 저장소 정책
│   ├── standards.md               → 어기면 깨지는 규칙(패치 허용 범위, 토큰, 검증 관문, 커밋)
│   ├── engineering-notes.md       → 빌드·서랍·검증에서 실제로 겪은 함정과 대응
│   ├── operations.md              → 준비, 빌드, 검증, 확인 기록, 배포, 공개 저장소 내보내기
│   ├── contracts.md               → 공개 주소, 브라우저 저장 키, CSV·PNG, 서랍 API, CLI 출력 형식
│   ├── build.md                   → (주제 안내) PhET 63개 원본 빌드·캐시·덧대기
│   ├── theme.md                   → (주제 안내) 디자인 토큰 키, 학교 표기, 패치 규칙, check-sim, 용어 교정
│   ├── drawer.md                  → (주제 안내) 서랍 파일 형식, 브라우저 API, compare-layout, run-cases
│   ├── lessons.md                 → (주제 안내) 수업 공식·용어와 단원 묶음을 정한 근거
│   ├── new-sims.md                → (주제 안내) 새 시뮬레이션 빌드, 글자, TypeScript 함정
│   ├── site.md                    → (주제 안내) 목록 사이트와 확인 기록 명령
│   ├── verify.md                  → (주제 안내) build-everything, verify 각 항목, 실제 실행 결과
│   └── tracking/
│       ├── status.md              → 지금 어디까지 됐고 무엇이 남았나(검증 숫자 포함)
│       ├── findings.md            → 풀지 못한 문제와 받아들인 한계
│       └── decisions/
│           ├── index.md           → 결정 기록 목록
│           └── NNNN-<slug>.md     → 결정 하나씩(맥락·선택·버린 대안·결과)
├── theme/AGENTS.md                → 디자인 토큰, 패치 엔진, 테마·외부 통신·용어 규칙, HTML 머리 삽입
├── brand/AGENTS.md                → 학교 표기 「부산과학고」 워드마크, 출처 문구, 브랜드 패치
├── drawer/AGENTS.md               → 수업 서랍 런타임, 주입기, 물리 내용 해시, 확인 상태 계산
├── adapters/AGENTS.md             → 시험 범위 시뮬레이션마다의 측정 정의·연결 코드·물리 검사 사례
├── sims/AGENTS.md                 → 새로 만든 시뮬레이션 5개와 틀(_template)
├── site/AGENTS.md                 → 목록 사이트 생성기와 스타일
├── data/AGENTS.md                 → 고정 목록·시험 범위·수업 내용·용어 교정·확인 상태·빌드 기록
└── tools/AGENTS.md                → 소스 받기, 빌드, 검사, 검증, 확인 기록 명령
```

`tests/`는 `npm test`가 도는 검사, `build/`·`dist/`·`sources`·`node_modules`는 git에 넣지 않는 생성물이다.

## 절대 규칙

1. **PhET의 물리 계산과 실험 화면 배치는 바꾸지 않는다.** PhET 소스에 대한 변경은 테마·학교 표기·한국어 문자열·외부 통신 끄기 네 종류의 패치 규칙뿐이고, 빌드용 임시 체크아웃에만 적용했다가 되돌린다. 시험 범위의 측정 연결은 빌드가 끝난 HTML에 서랍으로 넣는다. 수업 공식과 PhET 값이 다르면 PhET를 따르고 단위는 두 가지로 보여 주며 근사 차이는 「참고」로 적는다.
2. **공개되는 어떤 결과물(사이트, 빌드 HTML, 저장소 추적 파일, 공개 저장소)에도 선생님 실명, 수업 발언 직접 인용, 학생 이름, 개인 메일이 없어야 한다.** 실명 목록은 저장소 밖 `~/.config/bsshs-physics-sims/private-names.txt`에만 둔다. 공개 저장소에는 이 저장소의 git 기록을 절대 올리지 않고, 추적 파일만 새 기록으로 내보낸다.
3. **학생 기기에서 사이트 자신의 주소 말고는 어떤 요청도 나가지 않는다.** PhET 통계·업데이트 확인은 꺼져 있어야 하고, 글꼴은 HTML 안이나 같은 사이트에 둔다. 분석 도구를 넣지 않는다.
4. **PhET 출처 문구 6개는 `brand/bsshs/attribution.mjs`의 글자 그대로 About 창과 사이트 바닥에 있어야 하고, PhET 로고와 「PhET」 이름은 출처 문구 밖 어디에도 없어야 한다.**
5. **디자인 값(색, 글꼴 이름, 크기, 간격, 서랍 치수)은 `theme/tokens.json` 한 파일에만 둔다.** 다른 파일에 값을 쓰면 테스트가 실패한다.

전체 규칙과 검증 관문은 `docs/standards.md`에 있다.

## 작업 전에 읽을 것

- 늘: `docs/standards.md`, `docs/engineering-notes.md`, 손댈 모듈의 `AGENTS.md`.
- PhET 빌드·패치 규칙을 고칠 때: `theme/AGENTS.md`의 패치 규칙 모양, `docs/standards.md`의 패치 허용 범위, `docs/engineering-notes.md`의 빌드 함정(브랜드 덧대기, 비공개 PhET-iO, 맥 대소문자).
- `adapters/<id>/`나 `data/lessons/`를 고칠 때: `docs/business-rules.md`의 물리 내용 해시 범위. 이 파일들을 바꾸면 선생님 「확인 완료」가 「확인 중」으로 돌아간다.
- 측정 항목의 키·단위·뜻을 바꿀 때: `docs/business-rules.md`의 기록 정의 버전 규칙. 배포 뒤에는 `schemaVersion`을 올려야 학생 기록이 섞이지 않는다.
- 새 시뮬레이션 코드를 쓸 때: `sims/AGENTS.md`의 글자 별명 함정과 bamboo 두 곳 등록.
- 시험 범위 목록을 바꿀 때: `docs/engineering-notes.md`의 「시험 범위 목록을 바꿀 때」 점검표. 새 id에는 파일 네 개가 모두 있어야 사이트가 빌드되고, 수업 내용 테스트의 나머지 54개 id 목록도 같이 고쳐야 한다.
- 배포·공개 저장소 작업 전: `docs/operations.md`의 배포·내보내기 절차와 `docs/security.md`.
- 「완료」라고 말하기 전: `npm run verify`가 종료 코드 0이어야 한다. `build-everything`이 만든 `dist/`는 아직 물리 검사를 거치지 않았으므로 바로 배포하지 않는다. 배포 완료는 실제 주소 확인(200 + 내용)이 있어야 말한다.

## 문제가 생기면

다음은 발견 즉시 사용자에게 알린다(혼자 고치고 넘어가지 않는다).

- 실명·직접 인용·학생 이름·개인 메일이 사이트, 빌드, 추적 파일, 공개 저장소, 내보내기 폴더 중 어디에서든 발견됨(`V10c` 실패 포함).
- 이 비공개 저장소의 git 기록이나 gitignore된 로컬 작업 문서가 공개 저장소로 나갔거나 나갈 뻔함.
- 시뮬레이션에서 외부 주소로 요청이 나감(`check-sim`의 `network` 실패).
- 배포된 사이트가 `npm run verify`를 통과하지 않은 `dist/`이거나, 해시가 다른데 「선생님 확인 완료」가 보임.
- PhET 물리 계산이나 실험 화면 배치를 바꿔야만 풀리는 문제, 또는 고정 버전이 빌드되지 않아 다른 버전이 필요한 상황.
- 저장소나 빌드 결과에 비밀 값(토큰, 키)이 들어감.

그 밖의 문제는 `docs/tracking/findings.md`에 「어떤 조건에서 무엇이 보이나 · 영향 · 지금 못 푸는 이유 · 접근 방법」으로 적는다.
