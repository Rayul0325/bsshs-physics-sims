# 0013. 배포는 Cloudflare Pages 일반 프로젝트에 정적 파일만 올린다

## 맥락

링크만 있으면 누구나 로그인 없이 여는 공개 주소가 필요했다. 서버 코드, 분석 도구, 추적은 넣지 않는다. 배포 도구 wrangler 4는 새 프로젝트를 Workers(정적 자산) 쪽으로 만들려 하고, `wrangler pages project create`를 `--force` 없이 실행하면 Workers 진입 파일을 찾다가 `Missing entry-point`로 실패한다.

## 결정

Cloudflare Pages 일반 프로젝트 `bsshs-physics-sims`(운영 브랜치 `main`)를 `--force`로 한 번 만들고, 이후에는 `npx wrangler@4 pages deploy dist --project-name bsshs-physics-sims --branch main`으로 `dist/`만 올린다. `_headers`·`_redirects`·Functions는 두지 않는다.

## 버린 대안

- **Workers 정적 자산 프로젝트**: 진입 스크립트와 설정 파일이 필요해 「서버 코드 없음」 구조에 실행 코드가 하나 생긴다.
- **Git 연결 자동 배포(Pages가 공개 저장소를 받아 빌드)**: 빌드에 약 15 GB의 PhET 소스 캐시, 설치된 Google Chrome(워드마크·썸네일·검증), 실명 목록(V10c)이 필요해 Pages 빌드 환경에서 같은 빌드와 검증을 돌릴 수 없다.

## 결과

- 배포는 관리자 컴퓨터에서 직접 한다. 검증한 `dist/`를 그대로 올릴 수 있지만, 검증하지 않은 `dist/`도 올릴 수 있으므로 절차로 막는다.
- Pages의 확장자 없는 주소 규칙 때문에 `/sims/<id>.html`이 `/sims/<id>`로 308 이동한다.
- 프로젝트를 다시 만들 일이 생겨도 `--force`는 생성 때 한 번만 쓴다.
- 되돌리기는 Pages 배포 목록의 Rollback이다.
