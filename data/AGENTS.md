# data/ — 프로젝트 데이터

모든 도구가 읽는 데이터 파일이다. 손으로 고치는 파일과 도구만 쓰는 파일이 섞여 있다.

## 맡는 것

| 파일 | 내용 | 누가 쓰나 |
|---|---|---|
| `sims.json` | PhET 63개의 `id`, `branch`, `version`(고정 버전). 유일한 목록 | 사람(버전 반영 때만) |
| `exam-scope.json` | `{ exam, ids }` 시험 범위 id 배열(지금 14개)과 시험 이름 | 사람 |
| `lessons/<id>.json` | 시험 범위 하나의 수업 공식·용어: `id, title, unit, formulas, terms, classUnits, sources` | 사람 |
| `units.json` | 목록 사이트의 단원 `{ id, name, order, sims }`. 마지막이 「기타」 | 사람 |
| `titles.json` | PhET 63개의 고친 한국어 제목 | 사람(용어 교정과 함께) |
| `term-fixes.json` | 용어 교정 `{ global: [...], perSim: { <id>: [...] } }`, 항목 `{ from, to, reason }` | 사람 |
| `style-done.json` | 시뮬레이션 안쪽 디자인을 끝낸 id 배열(처음엔 `[]`). V11이 이 목록의 시뮬레이션만 검사한다. 68개를 넘지 않고 같은 id를 두 번 쓰지 않는다 | 사람 |
| `verification-status.json` | 시험 범위별 확인 상태 `{ status, date, memo, approvedHash? }` | `npm run approve`·`set-status`만 |
| `build-matrix.json` | 원본(학교판 아님) 빌드 기록과 `newSimBase` | 빌드 도구만 |
| `build-matrix.bsshs-theme.json` | PhET 63개 학교판 빌드 기록 | 빌드 도구만 |
| `build-matrix.new-sims.json` | 새 시뮬레이션 빌드 기록 | 빌드 도구만 |

## 맡지 않는 것

- 디자인 값은 `theme/tokens.json`이다. 여기에 색·크기를 두지 않는다.
- 측정 항목·그래프·검사 사례는 `adapters/<id>/`다.
- 수업 녹음 원본·전사는 저장소 밖에만 있다. 이 폴더에 복사하지 않는다.
- 저장소 주소와 출처 문구는 `brand/bsshs/attribution.mjs`다.

## 지켜야 할 것

- **개인정보**: 어느 파일에도 선생님 실명, 학생 이름, 개인 메일, 수업 발언 직접 인용을 쓰지 않는다. `lessons/*.json`의 `sources`에는 녹음 식별자(날짜·교시·짧은 해시)나 「표준」만 쓴다. `verification-status.json`의 `memo`도 공개 저장소에 나가므로 이름을 쓰지 않는다. 이 폴더 전체가 실명 검색(V10c) 대상이다.
- `sims.json`: 버전을 바꾸면 그 브랜치에서 실제로 빌드되는지 확인하고 보고한다. 빌드가 안 된다고 다른 버전으로 몰래 바꾸지 않는다. 목록을 바꾸면 `tests/data/lessons.test.mjs`의 시험 범위 밖 id 목록(`OTHER_IDS`)과 전체 수 68, `titles.json`, `units.json`도 맞춘다.
- `exam-scope.json`: 모든 id에 `adapters/<id>/`의 세 파일(`adapter.mjs`, `drawer.json`, `cases.json`)과 `lessons/<id>.json`이 있어야 한다. 하나라도 없으면 사이트 빌드가 아무것도 쓰기 전에 멈추고 빠진 것을 전부 출력한다. 새 id는 `npm run set-status -- <id> 확인 중`으로 상태 항목을 만든다. 시험 범위 밖으로 옮기는 시뮬레이션은 `units.json` 단원에 남아 있어야 카드가 생긴다(새 시뮬레이션도 `sims/` 폴더가 있으면 계속 공개된다). 변형 시뮬레이션을 시험 범위에 넣거나 빼면 `tests/data/lessons.test.mjs`의 `OTHER_IDS`도 고친다.
- `lessons/<id>.json`의 모양(테스트가 확인):
  - 최상위 키는 정확히 `classUnits, formulas, id, sources, terms, title, unit`. `id`는 파일 이름, `title`은 한국어, `unit`은 `units.json`의 단원 id.
  - 공식 2개 이상, 공식 `key`는 snake_case이고 겹치지 않으며 `name`·`expr`·`tex`·`variables`·`emphasis`·`outOfScope`(선택 `note` = 「참고」 한 줄).
  - 변수는 `key`, `symbol`, `name`, `unit`(수업 단위), 상수면 `constant`(CODATA 값).
  - 용어는 `term`, `definition`, `emphasis`, `outOfScope`.
  - `classUnits`는 `{ quantity, phetUnit, classUnit, factor }`, 시뮬레이션 단위 값 × factor = 수업 단위 값.
  - `emphasis: true`는 수업에서 시험에 나온다고 했거나 외우라고 했거나 반복해 짚은 것, `outOfScope: true`는 수업에서 시험 범위가 아니라고 분명히 말한 것에만.
  - 같은 양이면 변수 `key`를 `adapters/<id>/drawer.json`의 측정 키와 같게 쓴다.
- 사례(`adapters/<id>/cases.json`)에서 허용 오차를 1%보다 넓힌 측정 키는, 그 키를 `variables`에 가진 공식의 `note`가 「참고」로 시작해야 한다. 그 공식이나 `note`를 지우면 물리 검사가 실패한다.
- `lessons/`의 파일을 바꾸면 물리 내용 해시가 바뀌어 그 시뮬레이션의 「확인 완료」가 「확인 중」으로 돌아간다. 줄 바꿈·들여쓰기만 바꾸면 해시가 그대로다.
- `term-fixes.json`: `reason`은 `오역`·`수업 용어`·`표기`. `global`에는 어느 시뮬레이션·어느 문자열에서도 안전한 것만. 번역 파일을 공유하는 시뮬레이션은 `perSim`에 각각 적는다. 바꾸면 68개가 다시 빌드된다.
- `titles.json`: 고정 번역 원본 제목에 교정을 적용한 값과 같아야 한다.
- `units.json`: 시험 범위 밖 시뮬레이션은 반드시 어느 한 단원에 있어야 카드가 생긴다. 단원 배정은 수업 기록 기준이고, 해당 기록이 없으면 「기타」.
- `verification-status.json`을 손으로 고치지 않는다. 도구가 시험 범위 순서로 정렬하고 형식을 검사해 쓴다. `approvedHash`는 `확인 완료`에만 있다.
- `build-matrix*.json`은 손으로 고치지 않는다. `npm run build-everything`이 컴퓨터 경로를 `$BSSHS_CACHE`와 `.`로 바꾸고 줄 순서를 고정한다. 빌드 뒤 바뀌었으면 같이 커밋한다. `newSimBase`를 바꾸면 새 시뮬레이션 5개가 모두 다시 빌드된다.

## 테스트

- `tests/data/lessons.test.mjs`: 시험 범위 id가 겹치지 않고 필수 파일이 다 있음, 수업 내용 파일 모양, 단원 배정(68개가 정확히 한 번씩), 같은 변수 키 = 같은 양, 녹음 식별자 외 필드에 녹음 이름 없음, 실명 없음, 공식 계산 예.
- `tests/drawer/exam-complete.test.mjs`: 필수 파일 네 가지가 각각 빠졌을 때 모두 보고되는지, 사이트 빌드가 아무것도 쓰기 전에 멈추는지.
- `tests/terms/term-fixes.test.mjs`: 교정 모양, 쓸모없는 교정 없음, 제목 일치(고정 번역표가 캐시에 있어야 함).
- `tests/tools/matrix.test.mjs`, `tests/tools/sims.test.mjs`: 빌드 기록과 목록 형식.
- `tests/status/status-tools.test.mjs`: 상태 기록 도구.
- 이 폴더를 고친 뒤에는 `npm test` → `npm run build-everything` → `npm run verify`.
