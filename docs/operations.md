# 운영 절차

모든 명령은 저장소 루트에서 실행한다. 경로에 한글이 있으므로 `cd`할 때 따옴표로 감싼다.

## 1. 준비 (새 컴퓨터)

필요한 것: macOS 기준으로 확인했다. Node 24 이상, git, Google Chrome(설치된 것을 Playwright가 그대로 씀), GitHub에 닿는 인터넷, 디스크 약 20 GB(소스 캐시 약 15 GB + 빌드).

```sh
node --version                     # v24 이상이어야 한다 (package.json engines)
git --version
ls "/Applications/Google Chrome.app" # 없으면 Chrome부터 설치
npm install                        # playwright 하나. 브라우저를 내려받지 않는다
```

실명 검색(V10c)에 쓸 실명 목록을 저장소 밖에 둔다. 이 파일은 관리자가 따로 건네며, 저장소·문서·채팅에 내용을 옮기지 않는다.

```sh
mkdir -p ~/.config/bsshs-physics-sims
# 관리자에게 받은 파일을 ~/.config/bsshs-physics-sims/private-names.txt 로 둔다 (한 줄에 이름 하나, # 줄은 주석)
```

PhET 소스를 받는다. 처음에는 오래 걸리고, 이미 받은 것은 건너뛴다.

```sh
npm run fetch-sources              # 63개 시뮬레이션 + 형제 저장소의 bare 미러와 매니페스트 → ~/.cache/bsshs-physics-sims
```

`fetch-sources` 전에 빌드를 돌리면 매니페스트가 없어 실패한다. 다른 Node 버전이 필요한 빌드에는 `fnm`이 있어야 한다(`--node 24,20`).

## 2. 환경 변수

| 변수 | 기본값 | 쓰는 곳 | 뜻 |
|---|---|---|---|
| `BSSHS_CACHE` | `~/.cache/bsshs-physics-sims` | 받기·빌드·워드마크·고정 번역표를 읽는 테스트 | 소스 미러, 매니페스트, 빌드 슬롯, 전용 npm 캐시, grunt, 워드마크 PNG. 저장소 밖에 두어 여러 작업 폴더가 같이 쓴다 |
| `BSSHS_BUILD_DIR` | `<저장소>/build` | 빌드 도구, 테스트 | 빌드 출력 위치 |
| `BSSHS_SITE_DIR` | 없음 | `tests/site/site-browser.test.mjs` | 검사할 사이트 폴더. 없으면 `dist/`를 쓰고, `dist/index.html`도 없을 때만 건너뛴다. 그래서 오래된 `dist/`가 남아 있으면 그것을 검사한다(verify는 `dist`로 넣어 준다) |
| `BSSHS_PRIVATE_NAMES` | `~/.config/bsshs-physics-sims/private-names.txt` | verify V10c, 사이트 테스트 | 실명 목록 위치 |

비밀 값을 담는 환경 변수는 없다.

## 3. 빌드

```sh
npm run build-everything           # 1) 63개 학교판 + 새 시뮬레이션 5개 → build/bsshs-theme/<id>/<id>_ko.html
                                   # 2) data/build-matrix*.json 정리(컴퓨터 경로 제거, 줄 순서 고정)
                                   # 3) 목록 사이트 dist/ (서랍 주입, 썸네일, 글꼴)
npm run build-everything -- --force   # 이어서 하지 않고 전부 다시
```

- 처음 약 6분 30초, 바뀐 것이 없으면 약 1분 50초(32코어 기준). 같은 조건으로 성공한 시뮬레이션은 건너뛴다.
- 디자인 토큰, 패치 규칙, 출처 문구, 용어 교정을 바꾸면 `themeHash`가 달라져 68개가 모두 다시 빌드된다. `sims/<id>` 소스를 바꾸면 그 시뮬레이션만 다시 빌드된다.
- 빌드 뒤 `data/build-matrix*.json`이 바뀌었으면 같이 커밋한다.

부분 빌드:

```sh
npm run build-sim -- <id> --brand bsshs --theme        # 학교판 하나
node tools/build-new-sim.mjs <id>                      # 새 시뮬레이션 하나 (약 25~40초)
node tools/build-all.mjs --brand bsshs --theme --jobs 10 --include-new
npm run build-site                                     # 빌드는 그대로 두고 dist/만 다시
npm run build-sim -- <id>                              # 원본(학교판 아님) 빌드: build/<id>/, 비교 기준용
```

## 4. 검증

```sh
npm test                           # 단위·브라우저 테스트 (빌드·사이트가 없으면 일부 건너뜀)
npm run verify                     # V1~V6, V9, V10a~c, V11, V12, npm test 전체. 종료 코드 0이어야 「완료」
npm run verify -- --only V2,V9     # 일부만 (완료 판단에는 쓰지 않음)
```

- 순서가 중요하다: `build-everything` → `verify`. 빌드나 사이트를 다시 만들면 검증도 다시 한다.
- 보고서는 `build/verify/report.json`. 화면에는 항목마다 `통과  V2   check-sim 136/136` 같은 한 줄과 끝 줄 `모두 통과` 또는 `실패: …`가 나온다.
- V3에 실패하면 verify가 `dist/`를 다시 만든다: 새 시뮬레이션은 사이트에서 통째로 빠지고(V1이 68보다 작아 실패), 변형 시뮬레이션은 서랍 없이 공개된다(V3 실패로 보고). 이유는 `build/verify/exclusions.json`(`kind`: `sim`/`drawer`)에 남는다. 고친 뒤 `npm run build-everything`부터 다시 한다.
- `build-everything`이 만든 `dist/`는 아직 이 제외가 적용되지 않았다. 마지막 줄의 주의대로, 그 상태로 배포하지 않는다.
- 각 도구를 직접 돌리는 방법:

```sh
node tools/check-sim.mjs dist/sims/<id>.html [--width 390]
node tools/run-cases.mjs build/verify/injected/<id>.html <id>
node tools/compare-layout.mjs build/verify/injected/<id>.html build/bsshs-theme/<id>/<id>_ko.html --width 1280 --exclude-button --all-screens --pause-clock --seed-random
node tools/compare-bounds.mjs --freeze                          # 안쪽 디자인을 바꾸기 전에 한 번: 68개를 고정본으로 복사 (V12 기준)
node tools/compare-bounds.mjs <id>                              # 고정본과 지금 빌드의 요소 위치·크기 비교 (V12)
node tools/check-style.mjs build/bsshs-theme/<id>/<id>_ko.html  # 안쪽이 토큰 팔레트만 쓰는지 (V11)
node theme/patches/color-inventory.mjs <id>                     # 고쳐야 할 색 글자 목록
node tools/style-review.mjs --sims <id>,<id>                    # 전후 대조표 build/style-review/index.html
```

## 5. 선생님 확인 기록

확인 담당 선생님의 답을 받으면 도구로 기록한다. 파일을 손으로 고치지 않는다.

```sh
npm run approve -- <id> [메모]               # 「확인 완료」 + 지금의 물리 내용 해시
npm run set-status -- <id> 수정 중 [메모]    # 오류 지적
npm run set-status -- <id> 확인 중 [메모]    # 고친 뒤 다시 올림
```

그다음 반드시: `npm run build-site`(또는 `build-everything`) → `npm run verify` → 배포(아래 6). 상태는 사이트를 만들 때 HTML에 박히므로, 다시 만들지 않으면 화면이 바뀌지 않는다. `data/verification-status.json`을 커밋한다. 메모에는 선생님 이름이나 발언을 쓰지 않는다.

## 6. 배포 (Cloudflare Pages)

- 프로젝트: `bsshs-physics-sims`(이미 있는 일반 Pages 프로젝트), 운영 브랜치 `main`, 주소 `https://bsshs-physics-sims.pages.dev`.
- 프로젝트는 2026-11-04에 `npx wrangler@4 pages project create bsshs-physics-sims --production-branch main --force`로 한 번 만들었다. 다시 만들지 않으며, 다른 명령에 `--force`를 붙이지 않는다.

순서:

```sh
# 1) 배포할 dist/가 검증된 것인지 확인: 검증 보고서가 dist/보다 나중이어야 하고 ok여야 한다
#    (build-everything 직후의 dist/는 물리 검사 제외가 적용되지 않은 상태라 배포 금지)
node -e 'const r=require("./build/verify/report.json");console.log(r.ok, r.startedAt)'
ls -lT build/verify/report.json dist/index.html
# 아니면: npm run build-everything && npm run verify

# 2) 로그인 (토큰이 만료됐을 때만, 브라우저가 열린다)
npx wrangler login

# 3) 배포
npx wrangler@4 pages deploy dist --project-name bsshs-physics-sims --branch main
```

### 배포 확인 (배포했다고 말하기 전에 반드시)

```sh
SITE=https://bsshs-physics-sims.pages.dev
curl -sL -o /dev/null -w '%{http_code}\n' "$SITE/"                       # 200
curl -sL "$SITE/" | grep -c '부산과학고 물리 시뮬레이션'                   # 1 이상 (제목)
curl -sL "$SITE/" | grep -c '학교 공식 자료 아님'                          # 1 이상
# 모든 시뮬레이션이 200이고 dist/와 바이트까지 같은지 (.html은 308로 이동하므로 -L)
W=$(mktemp -d); for f in dist/sims/*.html; do id=$(basename "$f" .html)
  code=$(curl -sL -o "$W/$id.html" -w '%{http_code}' "$SITE/sims/$id")
  cmp -s "$f" "$W/$id.html" && [ "$code" = 200 ] || echo "BAD $id $code"; done; echo checked
node tools/check-sim.mjs "$SITE/sims/bsshs-photoelectric" --width 390     # ok: true
node tools/check-sim.mjs "$SITE/sims/bsshs-photoelectric" --width 1600    # ok: true
```

상태 코드 200만으로는 부족하다: 없는 주소도 Pages가 목록 페이지를 200으로 돌려준다. 그래서 위처럼 `dist/`와 바이트 비교를 한다. `BAD` 줄이 하나도 없고 check-sim이 통과해야 배포 완료다(2026-11-04 첫 배포: 68/68 200·바이트 같음, 시험 범위 4개 × 390/1600 통과, 오류 0, 외부 요청 0).

### 되돌리기

- Cloudflare 대시보드 → Pages → `bsshs-physics-sims` → Deployments → 이전 배포 선택 → Rollback.
- 또는 이전 커밋으로 `npm run build-everything` → `npm run verify` → 같은 배포 명령.
- 확인이 실패하면 무엇이 실패했는지 그대로 보고하고, 위 되돌리기 방법을 함께 알린다.

## 7. 공개 소스 저장소 내보내기

공개 저장소 `https://github.com/Rayul0325/bsshs-physics-sims`(공개, GPL-3.0)는 이 저장소의 기록과 별개다. 이 저장소에서 공개 저장소로 push하지 않는다. 내보내기 폴더는 `~/.local/share/bsshs-physics-sims/export/bsshs-physics-sims`이고, 그 폴더의 git 설정은 이미 되어 있다(remote `origin` = 공개 저장소, `user.name` = `Rayul0325`, `user.email` = `206921773+Rayul0325@users.noreply.github.com`).

```sh
# 0) 이 저장소에 내보낼 변경이 모두 커밋되어 있어야 한다 (git archive는 커밋된 것만 담는다)
git status --porcelain                                  # 비어 있어야 한다
REPO="$(pwd)"; EXP=~/.local/share/bsshs-physics-sims/export/bsshs-physics-sims

# 1) 내보내기 폴더를 HEAD의 추적 파일로 갈아 끼운다 (.git은 남긴다)
git -C "$EXP" config user.name; git -C "$EXP" config user.email   # Rayul0325 / noreply 주소인지 확인
find "$EXP" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git archive HEAD | tar -x -C "$EXP"

# 2) 공개 전 검사: 실명·개인 메일·비밀 값·절대 경로가 0건이어야 한다
node tools/verify.mjs --only V10c                       # 저장소 추적 파일 + 빌드 + dist의 실명 0건
grep -rIl -e '/[U]sers/' -e '@[g]mail' -e '@[n]aver' -e 'BEGIN [A-Z ]*PRIVATE KEY' "$EXP" --exclude-dir=.git   # 출력 없어야 함 (대괄호는 이 명령 줄 자체가 걸리지 않게 하려는 것)
# 내보내기 폴더에도 실명 목록을 같은 방식으로 돌린다 (이름은 출력하지 말고 건수만)
while IFS= read -r n; do case "$n" in ''|'#'*) continue;; esac
  [ ${#n} -ge 2 ] && grep -rIlF -- "$n" "$EXP" --exclude-dir=.git; done < ~/.config/bsshs-physics-sims/private-names.txt | sort -u | wc -l   # 0

# 3) 커밋과 push (내보내기 폴더에서)
git -C "$EXP" add -A
git -C "$EXP" status --short | head
git -C "$EXP" commit -m "<what changed>"
git -C "$EXP" log -1 --format='%an <%ae>'               # Rayul0325 <206921773+Rayul0325@users.noreply.github.com>
git -C "$EXP" push origin main
```

- 내보내기에는 gitignore된 것(받은 소스, `build/`, `dist/`, `node_modules`, 로컬 작업 문서)이 들어가지 않는다. 2026-11-04 첫 공개는 추적 파일 326개였다.
- 검사에서 하나라도 걸리면 push하지 않고 관리자에게 알린다.
- 저장소 이름이나 공개 여부를 바꾸는 일, 새 저장소를 만드는 일은 관리자 확인 뒤에만 한다.

## 8. 캐시 정리

```sh
du -sh ~/.cache/bsshs-physics-sims/*    # 크기 확인
rm -rf ~/.cache/bsshs-physics-sims      # 지워도 npm run fetch-sources로 같은 결과가 나온다 (워드마크 PNG는 다시 그려짐)
```
