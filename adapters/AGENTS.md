# adapters/ — 시험 범위 시뮬레이션마다의 서랍 연결

## 맡는 것

시험 범위 시뮬레이션 하나당 폴더 하나(`adapters/<id>/`)에 세 파일을 둔다. 지금 14개 + 연습용 `_example`(발전기, 공개되지 않음).

| 파일 | 내용 | 물리 내용 해시 |
|---|---|---|
| `drawer.json` | 측정 항목(키, 한국어 이름, 화면 단위, 수업 단위 변환)과 미리 정한 그래프, 정의 버전 `schemaVersion` | 들어감 |
| `adapter.mjs` | 실행 중 모델을 읽는 연결 코드(`screenName`, `read`, 자동 검사용 `apply`) | 들어감 |
| `cases.json` | 자동 물리 검사 사례(입력 → 기대값, 선택적 허용 오차) | 들어감 |
| (빠지면 안 됨) | 위 세 파일과 `data/lessons/<id>.json` 중 하나라도 없으면 사이트 빌드가 멈추고 빠진 것을 전부 출력한다 | — |
| `README.md`(선택) | 모델의 단위·규약·함정 메모 | — |
| `reference.py`(선택) | 기대값을 계산한 기준 스크립트(`bsshs-semiconductor`) | — |

## 맡지 않는 것

- 서랍 화면·저장·그래프 그리기는 `drawer/`다. 여기에 화면 코드를 넣지 않는다.
- 수업 공식·용어는 `data/lessons/<id>.json`이다. 측정 키만 그 변수 키에 맞춘다.
- PhET 시뮬레이션 코드와 새 시뮬레이션 모델(`sims/<id>/js/model/`)은 고치지 않는다. 어댑터는 읽기만 하고, `apply`만 모델 입력 Property를 바꾼다.
- 실험 화면에 글자·그림을 더하지 않는다. 화면에 숫자가 없는 시뮬레이션의 값은 서랍 안에만 나온다.

## 지켜야 할 것

- `drawer.json`: 최상위 키는 `simId`(폴더 이름과 같음), `schemaVersion`, `measurements`, `graphs`뿐. 측정 키는 camelCase이고 겹치지 않는다. 이름은 한국어. `unit`은 화면 단위(없으면 `""`). `classUnit`은 `{ unit, factor, offset? }`이고 수업 단위 값 = 값 × factor + offset, `factor`는 0이 아니며 `classUnit.unit`은 `unit`과 다르다. 그래프는 2개 이상, id는 kebab-case이고 `free`가 아니며 겹치지 않는다. 제목은 한국어, `x`·`y`(키 또는 키 배열)는 측정 키, `fit`은 `"linear"` 또는 `null`. 어기면 주입이 실패한다.
- 배포한 뒤 측정 항목의 키·뜻·단위를 바꾸면 `schemaVersion`을 올린다. 올리지 않으면 학생의 예전 기록 칸이 경고 없이 빈칸이 된다.
- 같은 양이면 측정 키를 수업 내용 파일의 변수 키와 같게 쓴다(그래야 「공식·용어」 탭이 현재 값을 대입한다).
- 상대값(모델 값)이면 이름에 「(모델 값)」을 붙인다.
- `adapter.mjs`: `import`(정적·동적) 금지, `bsshsDrawer.register({ simId, screenName, read, apply })`를 한 번만 부른다. `read()`는 서랍이 열려 있는 동안 0.5초마다 불리므로 가볍게 하고, `drawer.json`의 모든 키를 화면 단위 숫자 또는 `null`로 돌려준다. 모르는 값은 `null`이다(0으로 채우지 않는다).
- 화면·모델은 `drawer.helpers.screen()`·`model()`·`screenName()`으로 찾는다(joist 세 세대 처리). 모델 속성 이름은 그 시뮬레이션 고정 버전의 빌드된 HTML에서 `phet.joist.sim.screens[i].model`을 직접 보고 정한다.
- 어댑터는 PhET 계산을 고치지 않는다. 단위만 바꾼다(예: 모델의 단계당 기전력 × 25 = 초당). 부호 규약·근사 차이는 값을 그대로 두고 수업 내용 파일의 공식 「참고」에 적는다.
- `cases.json`: 배열, 사례마다 `name`·`params`·`expect`뿐. `expect`의 키는 측정 키, 값은 `{ value, relTol? }`뿐. 기대값 0이면 절대 오차 1e-9로 비교되므로, 0이 아닌 작은 값을 기대하면 그 값을 적는다. `relTol`을 기본 1%보다 넓히면 그 측정 키를 `variables`에 가진 `data/lessons/<id>.json` 공식의 `note`가 「참고」로 시작해야 한다. 없으면 V3가 실패한다. 이유는 사례 이름이나 `README.md`에도 적는다(지금: wave-interference `fringeSpacing` 4% 격자 해상도 → `fringe_spacing` 공식, bsshs-semiconductor `rippleVoltage` 6% 근사식 비교 → `ripple_voltage` 공식).
- 새 시뮬레이션 사례는 그 시뮬레이션이 반드시 모델링할 물리식을 모두 덮고, 경계 사례(문턱 아래 광전자 0개, 브루스터각에서 반사 p편광 0 등)를 넣는다. 기대값은 시뮬레이션 출력이 아니라 공식에서 따로 계산한다.
- 움직이는 모델은 `apply`에서 일시 정지하거나 정상 상태로 보낸다. 검사는 값이 0.1초 간격으로 세 번 같아질 때까지(최대 5초) 기다린다.

## 시뮬레이션별 함정 (메모 요약)

- `faradays-law`: 화면에 숫자가 없어 선속·기전력이 모델 값. 감은 수 N = 그림 고리 수 / 2(아래 2, 위 1), 기전력 부호 +. 이 joist 판에 `selectedScreenProperty`가 없어 화면을 직접 찾는다.
- `generator`·`faradays-electromagnetic-lab`: 시간 = 단계 수 × 1/25 s(`clock.elapsedTime`은 나머지라 쓰지 않음), 기전력 = `emfProperty` × 25, 선속 = `fluxProperty` ÷ N. 발전기 rpm 계기는 코일 끌림이 곱해진 값이라 자석 회전 속력과 따로 둔다.
- `wave-interference`: 2019년 joist라 화면을 `showHomeScreenProperty` + `screenIndexProperty`로 찾는다. 길이는 모두 nm. 무늬 간격은 빛 장면에서만, 스크린 세기에서 세 점 포물선 보간으로 잰다.
- `geometric-optics`: PhET 거울 곡률반지름은 「볼록 +」라 서랍에서 수업 규약(오목 +, R = 2f)으로 바꾼다. 물체가 초점에 있으면 상 거리 10⁷ cm.
- `bending-light`: 굴절률 이름값은 650 nm 기준, 다른 파장은 분산으로 조금 다르다. 공기 n = 1.000293.

## 테스트

- 주입 형식 검사: `node tools/inject-drawer.mjs build/bsshs-theme/<id>/<id>_ko.html <id> --out <작업 폴더>/<id>.html` (종료 코드 1이면 문제 목록).
- 물리 검사: `node tools/run-cases.mjs <작업 폴더>/<id>.html <id>` — 마지막 줄 `"ok":true`.
- 시뮬레이션별 물리 테스트: `tests/physics/<id>.test.mjs`(학교판 빌드에 서랍을 넣고 `cases.json`을 돌림, 빌드가 없으면 건너뜀). 기대값은 공식으로 따로 계산한 값이어야 한다.
- 그래프 글자: `tests/drawer/graph-text.test.mjs`가 모든 시험 범위 그래프를 검사한다.
- 넓힌 허용 오차의 「참고」 연결: `tests/verify/tolerance-notes.test.mjs`, 실제 검사는 `npm run verify -- --only V3`.
- PhET 시뮬레이션의 사례가 실패하면 그 시뮬레이션은 서랍 없이 공개되고, 새 시뮬레이션의 사례가 실패하면 사이트에서 통째로 빠진다.
- 이 폴더의 `drawer.json`·`cases.json`·`adapter.mjs`를 바꾸면 물리 내용 해시가 바뀌어 그 시뮬레이션의 「확인 완료」가 「확인 중」으로 보이게 된다.
