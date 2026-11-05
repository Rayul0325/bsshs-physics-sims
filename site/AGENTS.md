# site/ — 목록 사이트

## 맡는 것

- `build-site.mjs`: `build/bsshs-theme/<id>/<id>_ko.html`을 모아 정적 사이트 폴더(기본 `dist/`)를 만든다.
  - 시작하자마자 `assertExamComplete(exam.ids)`로 시험 범위 id마다 필수 파일 네 개를 확인한다. 하나라도 없으면 출력 폴더를 지우기 전에 빠진 것을 전부 출력하고 멈춘다.
  - `<out>/sims/<id>.html`: 시험 범위 id는 `tools/inject-drawer.mjs`를 자식 프로세스로 불러 서랍을 넣은 사본(`--no-drawer`에 든 id는 서랍 없이), 나머지는 그대로 복사.
  - `<out>/thumbs/<id>.png`: `--thumbs`일 때 설치된 Chrome으로 첫 화면을 찍음(크기 `tokens.site.thumbWidth/thumbHeight`, 640×400).
  - `<out>/fonts/`: `fontFaces(tokens)`의 글꼴 파일과 OFL 라이선스를 같은 사이트 파일로 복사.
  - `<out>/index.html`: 카드 목록. 순서는 `data/units.json` 단원(`order`) → 마지막 단원 「기타」. 시험 범위 칸은 따로 없고 카드에 표시와 확인 배지를 단다.
  - 순수 함수(`catalogueModel`, `indexHtml`, `siteCss`, `siteVariables`, `titleFromHtml`, `esc`)는 파일을 쓰지 않아 단위 테스트가 직접 부른다.
- `site.css`: 사이트 모양. 값은 `--bsshs-*`(토큰 전체), `--site-*`(`tokens.site`), `--bsshs-size-*`(`tokens.size`) 변수와 `__BREAKPOINT_SHEET__`·`__BREAKPOINT_LARGE__` 자리표시자로만 받는다.

## 맡지 않는 것

- 시뮬레이션 빌드(`tools/`), 서랍 주입 내용(`drawer/`, `adapters/`), 출처 문구(`brand/bsshs/attribution.mjs`), 디자인 값(`theme/tokens.json`), 제목·단원·시험 범위·확인 상태 데이터(`data/`).
- 배포는 이 모듈의 일이 아니다. 만든 폴더를 올리는 것은 운영 절차다.
- 확인 상태를 바꾸지 않는다. 읽어서 `resolveStatus`로 표시만 정한다.

## 지켜야 할 것

- 출력 폴더는 시작할 때 통째로 지운다(`rmSync`). 그 폴더에 손으로 둔 파일은 사라진다.
- 빌드가 없는 시뮬레이션이 하나라도 있으면 멈춘다(`missing builds: …`). 일부러 뺄 때만 `--exclude`, 시험용으로만 `--allow-missing`을 쓴다.
- `--exclude`(사이트에서 뺌)와 `--no-drawer`(서랍 없이 공개)는 물리 검사 실패를 반영하려고 verify가 넘긴다. 이 모듈은 `build/verify/exclusions.json`을 직접 읽지 않는다(오래된 제외 기록이 고친 뒤에도 남지 않게). 그래서 `build-everything`이 만든 사이트는 제외가 적용되지 않은 상태다.
- `--no-drawer`로 서랍을 뺀 시뮬레이션도 지금은 카드에 「시험 범위」 표시와 확인 배지가 그대로 붙는다.
- 서랍 주입이 실패하면(어댑터 파일 형식 오류) 멈춘다. 서랍 없이 시험 범위 시뮬레이션을 내보내지 않는다.
- 외부 주소를 부르지 않는다. 글꼴은 `fonts/`의 같은 사이트 파일, 썸네일·링크는 상대 경로다. 분석 스크립트를 넣지 않는다.
- 바닥에 출처 문구(`notOfficial`, `phetCredit`, `originalKo` · `modifiedBy`, `licenses` · 비상업 용도, 저장소 링크)를 둔다. 제목은 `<WORDMARK> 물리 시뮬레이션`.
- 제목: PhET 63개는 `data/titles.json`, 새 시뮬레이션은 빌드된 HTML의 `<title>`(숫자 문자 참조를 풀고 방향 표시 문자를 뺌).
- 새 시뮬레이션 목록은 `listNewSimIds()`(`sims/` 아래 `_`로 시작하지 않는 폴더)로 만든다. verify와 같은 정의다. 시험 범위 id의 접두어로 고르지 않는다.
- 시험 범위가 아닌 시뮬레이션은 `data/units.json`의 어느 단원에 적혀 있어야만 카드가 생긴다.
- `site.css`에 색·글꼴 이름·치수 값을 쓰지 않는다(디자인 값 검사 대상).
- 390px에서 가로 넘침이 없어야 하고, 누르는 곳은 44px 이상, 1600px 이상에서 본문 글자 18px 이상이다.
- HTML에 넣는 모든 데이터 문자열은 `esc()`로 이스케이프한다.

## 작업 방식

```sh
node site/build-site.mjs [--sims-dir build/bsshs-theme] [--out dist] [--thumbs] [--exclude id,id] [--no-drawer id,id] [--allow-missing]
```

출력 마지막 줄은 JSON `{ out, sims, missing, excluded, noDrawer, thumbs }`다. 썸네일 촬영은 `check-sim`과 같은 준비 조건(시뮬레이션 생성 완료, 시작 화면 사라짐)을 기다린다. 썸네일 하나가 실패해도 사이트는 만들어지고 그 카드는 빈 썸네일 칸이 된다.

## 테스트

- `tests/site/site.test.mjs`: 시험 범위 칸 없음·단원 순서·「기타」 마지막, 모든 시뮬레이션이 어느 단원에 있음, 빌드 없는 시뮬레이션은 빈 링크 대신 빠짐, 배지·출처·「공식 아님」·저장소 링크·`lang="ko"`, CSS 자리표시자가 모두 채워짐, `<title>` 해석. 디자인 값이 CSS에 없는지는 `tests/theme/no-literals.test.mjs`가 본다.
- `tests/site/site-browser.test.mjs`: `BSSHS_SITE_DIR`의 실제 사이트에서 모든 카드 링크의 파일이 있음, 시험 범위 강조·배지, 바닥 출처 문구, 실명 0건(`BSSHS_PRIVATE_NAMES`), 390px 가로 넘침 없음, 44px 누르는 곳, 1600px 글자 18px, 같은 origin 요청만. 환경 변수가 없으면 `dist/`를 검사하고, `dist/index.html`도 없으면 건너뛴다(남은 옛 `dist/`를 검사할 수 있으니 먼저 다시 만든다). 68개가 실제로 열리는지는 verify의 V2가 사이트 파일에 check-sim을 돌려 확인한다.
- `tests/drawer/exam-complete.test.mjs`: 시험 범위 파일이 빠지면 사이트 빌드가 아무것도 쓰기 전에 멈추고 빠진 것을 전부 출력하는지.
- `tests/verify/exclusions.test.mjs`: 제외 종류(`sim`/`drawer`)가 `--exclude`/`--no-drawer`로 바뀌는지, 다시 만들 필요 판단.
- verify의 V6는 위 테스트에 더해 `index.html`의 카드 68개와 확인 배지가 달린 시험 범위 카드 14개를 직접 센다.
