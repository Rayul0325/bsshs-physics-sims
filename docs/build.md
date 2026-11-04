# PhET 시뮬레이션 원본 빌드 방법

PhET 공개 소스(GPL-3.0)를 **고친 곳 없이** 한국어(`ko`)·`adapted-from-phet` 브랜드로 다시 빌드하는 방법입니다.
목록과 버전은 `data/sims.json` 한 곳에만 적혀 있고, 모든 도구가 이 파일을 읽습니다.

## 한 번에 하기

```sh
npm run fetch-sources            # 63개 소스 받기 (이미 받은 것은 건너뜀)
npm run build-all                # 63개 전부 빌드
npm run build-sim -- gravity-and-orbits      # 하나만 빌드
npm test                         # 도구 단위 테스트
```

결과물은 `build/<id>/<id>_ko.html`(파일 하나로 열리는 HTML)이고, 빌드 기록은 `data/build-matrix.json`에 남습니다.
로그는 `build/logs/<id>.log`, 전체 실행 로그는 `build/logs/build-all.log`입니다.

## 버전 고정 규칙

- 각 시뮬레이션은 `github.com/phetsims/<id>`의 **release 브랜치 HEAD**(예: `1.6`)를 씁니다.
  HEAD와 `dependencies.json`에 적힌 시뮬레이션 SHA의 차이는 `dependencies.json` 파일 하나뿐인 것을 확인했습니다(`manifests/<id>.json`의 `headExtraFiles`).
- 공통 부품(chipper, joist, scenery …)은 그 브랜치의 `dependencies.json`에 적힌 SHA 그대로 씁니다.
- `package.json` 버전이 표와 다르면 **다른 버전으로 바꾸지 않고 멈춥니다**.
- `perennial-alias`는 GitHub의 `phetsims/perennial` 저장소를 한 번 더 받은 것입니다.
- PhET-iO 저장소(`phet-io`, `phet-io-wrappers`, `phet-io-sim-specific`, `studio` 등)는 비공개라 받을 수 없고, `adapted-from-phet` 빌드에는 쓰이지 않습니다. 빌드 로그에도 `WARNING404: Skipping potentially non-public dependency`로 건너뛴다고 나옵니다. 받지 못한 목록은 매니페스트의 `unavailable`에 적힙니다.
- 번역 저장소 `babel`은 PhET가 SHA를 고정하지 않습니다(PhET 빌드 서버는 빌드 순간의 `babel` main을 썼습니다). 그래서 **`dependencies.json` 주석에 적힌 릴리스 시각 직전의 `babel` main 커밋**을 골라 매번 같은 결과가 나오게 했습니다. 고른 SHA는 행렬의 `babelSha`에 있습니다.

## 캐시 위치

받은 저장소는 git 작업 폴더 **밖**에 둡니다. 다른 작업 폴더나 다음 작업에서도 그대로 다시 씁니다.

- 기본 위치: `~/.cache/bsshs-physics-sims` (환경변수 `BSSHS_CACHE`로 바꿀 수 있음)
- `mirrors/<repo>.git` : 저장소마다 bare 미러 1개 (브랜치·태그만)
- `manifests/<id>.json` : 시뮬레이션마다 고정 SHA, babel SHA, chipper 버전, 부품 날짜를 정리한 파일
- `slots/slot-N/` : 빌드용 형제 폴더 묶음. 시뮬레이션마다 의존 SHA가 달라서 동시에 빌드하려면 묶음이 여러 개 필요합니다. 한 묶음은 한 번에 한 빌드만 씁니다(`.lock`). 그 시뮬레이션에 필요 없는 폴더는 `.parked/`로 잠시 옮깁니다.
- `npm-cache/` : 이 프로젝트 전용 npm 캐시 (`~/.npm`은 건드리지 않음)
- `tools/grunt-cli-1.4.3/` : grunt 실행기

빌드 출력 위치는 기본 `build/`이고 `BSSHS_BUILD_DIR`로 바꿀 수 있습니다.
캐시를 지워도 다시 받으면 같은 결과가 나옵니다(`rm -rf ~/.cache/bsshs-physics-sims`).

## 빌드가 하는 일

1. 슬롯 안에서 시뮬레이션과 형제 저장소를 고정 SHA로 체크아웃합니다 (`git checkout --force --detach`, 추적되지 않는 파일 삭제, `node_modules`는 유지).
2. 시뮬레이션의 `build/`와 `chipper/dist`를 지웁니다(다른 시뮬레이션의 찌꺼기가 섞이지 않게).
3. `chipper`, `perennial-alias`, 시뮬레이션 폴더에서 `npm ci`(잠금 파일이 있을 때) 또는 잠금 파일을 만들지 않는 `npm install`을 합니다. 같은 `package.json`·잠금 파일·Node 주 버전이면 다시 설치하지 않습니다.
4. 시뮬레이션 폴더에서 grunt를 실행합니다. chipper 세대에 따라 인자가 다릅니다(PhET perennial의 `getBuildArguments`와 같은 규칙).
   - chipper 0.0.0 (RequireJS 시절): `grunt build --brand=adapted-from-phet --locales=ko --lint=false`
   - chipper 2.x: `grunt build --brands=adapted-from-phet --locales=ko --lint=false`
   - 린트는 코드 모양 검사라 결과물과 상관없어서 끕니다. 타입 검사는 chipper 기본값을 따릅니다(`--no-type-check`로 끌 수 있음).
   - 타입 검사가 **비공개 PhET-iO 파일이 없다는 오류만으로** 실패하면(예: `error TS5083: Cannot read file '…/phet-io/tsconfig-module.json'`) chipper의 `--type-check=false`로 한 번 더 빌드합니다. 타입 검사는 결과물을 바꾸지 않습니다. 다른 타입 오류가 하나라도 섞여 있으면 다시 하지 않고 실패로 남깁니다. 다시 한 경우 행렬의 `typeCheckSkipped`에 원래 오류가 적힙니다.
5. 빌드 후 모든 형제 저장소에서 추적 파일이 바뀌지 않았는지 `git status`로 확인해 `trackedChangesAfterBuild`에 적습니다(빈 배열 = 소스 그대로).

## 빌드 설정 덧대기(overlay) (중요)

chipper 2는 시뮬레이션 `package.json`의 `phet.supportedBrands`에 없는 브랜드를 거부합니다
(`AssertionError: Unsupported brand: adapted-from-phet`). 63개 중 상당수가 `phet`/`phet-io`만 적혀 있어 그대로는 빌드되지 않습니다.

기본 동작으로, 그 오류가 났을 때만 **임시 슬롯 체크아웃의 `package.json`에 `adapted-from-phet` 한 줄을 더하고** 다시 빌드한 뒤 `git checkout -- package.json`으로 되돌립니다(빌드 설정 변경으로 승인됨).
시뮬레이션 코드, 문자열, 브랜드 저장소는 건드리지 않습니다. 행렬에는 해당 시뮬레이션의 `overlays`에 이 사실이, `strictError`에 덧대기 전 원래 오류가 그대로 남습니다.
`--no-brand-overlay`를 주면 덧대지 않고 실패로 기록합니다.

### `chipper-skip-tsc`

`circuit-construction-kit-ac`, `circuit-construction-kit-ac-virtual-lab` 1.0의 chipper는 빌드할 때마다 `tsc --build`(타입 검사)를 돌리는데,
이것이 비공개 저장소 파일 `phet-io/tsconfig-module.json`을 읽으려다 `error TS5083`으로 멈춥니다. `--type-check=false`로도 꺼지지 않습니다.
**그 TS5083 오류 하나만** 났을 때, 임시 슬롯의 `chipper/js/grunt/Gruntfile.js`에서 그 타입 검사 호출 두 줄만 빼고 다시 빌드한 뒤 되돌립니다.
나중 chipper의 `--type-check=false`와 같은 효과이고, 결과물 변환(Transpiler·webpack)은 그대로입니다. 비공개 PhET-iO 저장소를 흉내 낸 가짜 파일은 만들지 않습니다.
행렬의 `overlays`에 `chipper-skip-tsc: …`로 남습니다.

## 새 시뮬레이션의 기준 부품 묶음 (`newSimBase`)

`data/build-matrix.json`의 `newSimBase`가 직접 만들 시뮬레이션 5개가 기준으로 쓸 부품 SHA 묶음입니다.
빌드에 성공한 시뮬레이션마다 핵심 부품 9개(axon, dot, joist, kite, phet-core, scenery, scenery-phet, sun, tandem)가 main 브랜치에서 갈라진 날짜를 구하고, 그중 **가장 오래된 날짜**를 그 묶음의 나이로 봅니다. 이 값이 가장 최근인 묶음을 고릅니다(같으면 릴리스 날짜가 늦은 쪽).
유지보수 패치 커밋은 날짜가 최근이라도 옛 부품 위에 얹힌 것이므로, 갈라진 날짜를 써야 실제 부품 나이를 알 수 있습니다.

## 문제 해결

- **`Unsupported brand: adapted-from-phet`** : 위의 빌드 설정 덧대기 설명 참고(기본으로 처리됨).
- **npm `EACCES` (`~/.npm/_cacache`)** : 이 도구는 전용 캐시(`$BSSHS_CACHE/npm-cache`)를 쓰므로 생기지 않아야 합니다. 생기면 그 폴더를 지우고 다시 실행하세요.
- **다른 Node 버전이 필요할 때** : `--node 24,20`처럼 주면 앞 버전이 실패할 때 다음 버전으로 다시 빌드합니다. Node 24 외 버전은 `fnm`으로 준비합니다(`/opt/homebrew/bin/fnm`). 실제로 쓴 버전은 행렬의 `nodeVersion`에 남습니다.
- **`slot … is in use by pid …`** : 다른 빌드가 그 슬롯을 쓰는 중입니다. 다른 `--slot` 번호를 쓰거나 끝날 때까지 기다리세요. 프로세스가 죽어서 남은 잠금은 자동으로 회수합니다.
- **중간에 끊겼을 때** : 같은 명령을 다시 실행하면 이미 성공한 시뮬레이션(같은 의존 묶음 + 결과 파일 있음)은 건너뜁니다. 처음부터 다시 하려면 `--force`.
- **캐시 크기 확인** : `du -sh ~/.cache/bsshs-physics-sims/*`
