# 목록 사이트와 선생님 확인 기록

## 목록 사이트 (`site/`)

- `node site/build-site.mjs [--out dist] [--thumbs] [--exclude id,id] [--no-drawer id,id] [--allow-missing]`
  - **시작할 때 시험 범위 id마다 어댑터(`adapter.mjs`·`drawer.json`), 사례(`cases.json`), 수업 내용(`data/lessons/<id>.json`)이 다 있는지 확인합니다(사양 2.3).** 하나라도 없으면 아무것도 쓰기 전에 멈추고, 빠진 것을 **한꺼번에 전부** 출력합니다(`drawer/inject.mjs`의 `assertExamComplete`).
  - 「새 시뮬레이션」은 `sims/` 아래 폴더(`listNewSimIds`)로 정합니다. verify와 같은 정의입니다.
  - `build/bsshs-theme/<id>/<id>_ko.html`(학교판 빌드)을 모아 `<out>/sims/<id>.html`로 복사합니다. 시험 범위 14개는 이때 수업 서랍을 넣습니다(`tools/inject-drawer.mjs`).
  - `--thumbs`: 시뮬레이션마다 첫 화면을 찍어 `<out>/thumbs/<id>.png`로 씁니다(크기는 `theme/tokens.json`의 `site.thumbWidth/thumbHeight`).
  - 글꼴은 `<out>/fonts/`에 같은 사이트 파일로 넣습니다(외부 CDN 없음). OFL 라이선스 파일도 함께 복사합니다.
  - 빌드가 없는 시뮬레이션이 있으면 멈춥니다. 물리 검사에 실패한 새 시뮬레이션처럼 일부러 뺄 때는 `--exclude`를 씁니다.
  - `--no-drawer id,id`: 시험 범위 시뮬레이션을 수업 서랍 없이(테마 빌드 그대로) 공개합니다. 물리 검사에 실패한 PhET 시뮬레이션에 verify가 씁니다(사양 3.5).
- 순서: `data/units.json` 단원 순서 → 「기타」. 시험 범위 14개를 따로 묶는 칸은 없고, 자기 단원 안에서 「시험 범위」 표시와 확인 배지를 답니다.
- 제목: PhET 63개는 `data/titles.json`(용어 교정 반영), 새 시뮬레이션 5개는 빌드된 HTML의 `<title>`.
- 디자인 값: `site/site.css`는 `--bsshs-*`(토큰 전체)와 `--site-*`(`tokens.site`)만 씁니다. 화면 폭 기준(600px, 1600px)도 `tokens.breakpoint`에서 채웁니다.
- 검사: `tests/site/site.test.mjs`(구성), `tests/site/site-browser.test.mjs`(`BSSHS_SITE_DIR`의 실제 빌드: 링크·배지·출처·실명 0건·390px 가로 넘침 없음·누르는 곳 44px·1600px 글자 18px·외부 요청 0건).

## 선생님 확인 기록 (`data/verification-status.json`)

파일을 손으로 고치지 않고 도구로 적습니다.

| 하는 일 | 명령 |
|---|---|
| 선생님이 확인해 주셨을 때 | `node tools/approve.mjs <id> [메모]` → 「확인 완료」 + 그때의 물리 내용 해시 |
| 선생님이 오류를 짚으셨을 때 | `node tools/set-status.mjs <id> 수정 중 [메모]` |
| 고친 뒤 다시 올릴 때 | `node tools/set-status.mjs <id> 확인 중 [메모]` |

- 「확인 완료」 뒤에 물리 내용(수업 공식 파일, 측정 항목·단위, 그래프, 물리 검사 사례, 새 시뮬레이션의 모델 코드)이 바뀌면 화면에는 자동으로 「선생님 확인 중」이 보입니다. 디자인·용어 교정은 영향이 없습니다.
- 메모는 화면에 나오지 않습니다. 선생님 이름도 적지 않습니다.
- 상태를 바꾼 뒤에는 사이트를 다시 만들어야 화면에 반영됩니다(`node site/build-site.mjs`).
