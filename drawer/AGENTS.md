# drawer/ — 수업 서랍

## 맡는 것

- `core.js`: 순수 계산(저장 키, 수업 단위 변환, 열 만들기, CSV, 값 정리, 최소제곱 직선, 공식 대입, 비교 규칙 `checkExpect`, 기본 허용 오차). DOM이 없고 `globalThis.BsshsDrawerCore`에 붙는 고전 스크립트라 브라우저와 node 테스트가 같은 파일을 쓴다.
- `runtime.js`: 브라우저 화면(shadow DOM 호스트, 열기 버튼, 탭 세 개, 확인 대화, 예전 기록 안내, 그래프 캔버스), `localStorage` 저장, `window.bsshsDrawer` API, `drawer.helpers`(joist 세 세대의 화면·모델 찾기).
- `drawer.css`: 서랍 모양. 값은 `--bsshs-*` 변수와 `__이름__` 자리표시자로만 받는다.
- `config.mjs`: 토큰의 서랍 키를 검사하고 자리표시자 값으로 바꾼다(`drawerLayout`). 숫자를 갖지 않는다.
- `inject.mjs`: 빌드된 HTML 하나에 서랍 묶음을 넣는다(`injectDrawer`). `drawer.json`·`cases.json`·`adapter.mjs` 형식 검사, 수업 내용의 공개 필드만 남기기, 확인 상태 계산.
- `hash.mjs`: 물리 내용 해시(`physicsHash`, `physicsHashInputs`, `canonicalJson`, `HASH_SCOPE_VERSION`).
- `status.mjs`: 확인 상태 세 가지와 표시 글자, 상태 파일 검사(`validateStatusFile`), 표시 결정(`resolveStatus`).

## 맡지 않는 것

- 시뮬레이션별 측정 정의·연결 코드·검사 사례는 `adapters/<id>/`다. 서랍 코드에 특정 시뮬레이션의 분기를 넣지 않는다.
- 수업 공식·용어 내용은 `data/lessons/`, 확인 상태 기록은 `data/verification-status.json`(쓰기는 `tools/lib/status-file.mjs`)이다.
- 디자인 값은 `theme/tokens.json`이다.
- 사이트에 서랍을 넣는 순서는 `site/build-site.mjs`가, 검증용 사본 만들기는 `tools/verify.mjs`가 정한다.
- PhET 소스와 빌드 과정은 건드리지 않는다. 서랍은 빌드가 끝난 HTML에만 들어간다.

## 지켜야 할 것

- 서랍을 닫은 상태에서 실험 화면 픽셀은 열기 버튼 상자 밖에서 서랍 없는 빌드와 같아야 한다. 열기 버튼에 그림자를 두지 않는다. 서랍은 시뮬레이션을 옮기거나 다시 배치하지 않고 위에 덮는다. 휴대폰 시트는 선택된 화면 `layoutBounds` 아래 공간만 덮되 `sheetMinHeight`~`sheetHeight` 안으로 자른다.
- `Math.random`을 쓰지 않는다(배치 비교가 두 파일의 난수를 맞춘다).
- 서랍 안에서 시작한 포인터·터치·휠·키·포커스 이벤트를 호스트에서 `stopPropagation`한다(scenery는 `window`/`document`에서 입력을 받는다).
- 서랍은 시뮬레이션 준비(`phet.joist.sim`, 생성 완료)와 시작 화면이 사라진 뒤에 붙고 그때 `mounted = true`다.
- 런타임 코드와 어댑터는 HTML에 인라인되므로 아무것도 내려받지 않는다. 주입기는 `</script`와 `<!--`를 이스케이프하고, JSON 안의 `<`, U+2028, U+2029를 이스케이프한다.
- 수업 내용 중 서랍 HTML에 넣는 필드는 `id, title, unit, formulas, terms, classUnits`뿐이다. `sources`는 절대 넣지 않는다.
- 확인 상태 표시에 선생님 이름과 `memo`를 쓰지 않는다. `확인 완료`인데 `approvedHash`가 현재 해시와 다르면 「선생님 확인 중」(`stale: true`)이다. 항목이 없거나 상태 값이 틀리면 「선생님 확인 중」이다.
- 해시 범위: 수업 내용 파일, `drawer.json`, `cases.json`, `adapter.mjs`, 새 시뮬레이션의 `sims/<id>/js/model/**`. 이 밖의 것(토큰, 테마, 브랜드, 용어 교정, 이 폴더의 코드, 보기 코드)을 넣지 않는다. 범위나 인코딩을 바꾸면 `HASH_SCOPE_VERSION`을 올린다. 해시 계산을 다른 곳에 다시 구현하지 않는다.
- 저장 키는 `bsshs:log:<simId>:v<schemaVersion>`. 다른 버전 키는 현재 표에 섞지 않고 「이전 기록 CSV 내려받기」/「받지 않고 지우기」로 처리한다. 줄이 0개면 키를 지운다.
- CSV는 BOM + CRLF, 숫자는 보통 표기. 화면의 숫자는 유효숫자 4자리와 위첨자 지수.
- 그래프 캔버스의 모든 글자는 그리기 전에 재서 줄을 바꾸고, 세로축 이름은 `drawer.graph.labelMaxLines`줄을 넘으면 「…」로 줄인다. 글자가 서로 겹치거나 캔버스를 벗어나지 않아야 한다.
- 이 폴더에 색·글꼴 이름·치수 값을 쓰지 않는다. `drawer.css`에 새 자리표시자를 쓰면 `config.mjs`의 `drawerLayout`에 그 키를 더하고 토큰에 값을 둔다. `drawer.graph`의 키는 `config.mjs`의 목록과 정확히 같아야 한다(모르는 키가 있으면 주입이 멈춘다).

## 작업 방식

- 런타임에 기능을 더할 때는 계산을 `core.js`에 순수 함수로 두고 테스트한 뒤 `runtime.js`에서 부른다.
- API(`window.bsshsDrawer`)는 검사 도구와 테스트가 쓰는 약속이다. 멤버를 지우거나 뜻을 바꾸지 않는다.
- 상태 파일이나 수업 내용을 바꾼 결과는 다시 주입해야 HTML에 반영된다.

## 테스트

- `tests/drawer/core.test.mjs`(순수 계산, CSV BOM, 단위, 직선, 대입), `hash.test.mjs`(해시 범위: 들어가는 파일을 바꾸면 바뀌고 빠지는 파일은 그대로, 줄 바꿈만 바꾸면 그대로), `status.test.mjs`(세 상태, 해시 불일치), `inject.test.mjs`(형식 검사, `sources` 제외, 다시 주입), `literals.test.mjs`(값 금지), `helpers-joist.test.mjs`(joist 세 세대), `graph-text.test.mjs`(14개 서랍의 모든 그래프를 390·1280·1600에서 글자 상자 검사), `sheet-visible.test.mjs`(시트 위 시뮬레이션이 보임, 열기 전후 배치 같음), `slope-unit.test.mjs`, `run-cases.test.mjs`, `compare-screens.test.mjs`, `browser-fixture.test.mjs`(가짜 시뮬레이션 페이지), `browser-real.test.mjs`(실제 학교판 빌드: 새로 고침 뒤 기록 유지, 「모두 초기화」 뒤 유지, 「새 실험 시작」, 화면 바꿈, CSV·PNG, 정의 버전 올림, 닫힌 서랍 24px 띠 돌연변이가 실패하는지).
- 실제 빌드 테스트는 `build/bsshs-theme/<id>/<id>_ko.html`이 있어야 돈다. 없으면 건너뛰고, verify는 건너뜀을 실패로 본다.
- 바꾼 뒤에는 서랍이 든 14개 모두에서 V9(1280·390, 모든 화면)와 V4를 다시 돌린다.
