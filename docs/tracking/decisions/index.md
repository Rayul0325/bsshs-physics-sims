# 결정 기록

| 번호 | 결정 | 상태 |
|---|---|---|
| [0001](0001-rebuild-from-release-branches.md) | PhET 공개 release 브랜치 소스를 다시 빌드한다(완성 HTML 덧씌우기·최신 버전 대신) | 유지 |
| [0002](0002-babel-pinned-by-release-time.md) | 번역 저장소 `babel`은 릴리스 시각 직전 커밋으로 고정한다 | 유지 |
| [0003](0003-brand-rides-adapted-from-phet-slot.md) | 학교 브랜드는 `adapted-from-phet` 브랜드 자리를 빌려 빌드 때만 바꿔 넣는다 | 유지 |
| [0004](0004-patch-rules-over-version-diffs.md) | PhET 소스 변경은 버전별 diff가 아니라 데이터로 적은 규칙 + 따로 적은 허용 목록으로 한다 | 유지 |
| [0005](0005-drawer-injected-after-build.md) | 수업 서랍은 빌드가 끝난 HTML에 PhET 부품 밖의 독립 화면 요소로 넣는다 | 유지 |
| [0006](0006-physics-hash-scope.md) | 선생님 재확인은 물리 내용(수업 내용, 측정 정의, 검사 사례, 새 시뮬레이션 모델)이 바뀔 때만 | 유지 |
| [0007](0007-automated-physics-check-gates-publication.md) | 공개 조건은 자동 물리 검사, 선생님 확인은 표시만. 새 시뮬레이션 실패는 통째로 제외 | 유지 |
| [0008](0008-original-sims-on-phet-libraries.md) | 새 시뮬레이션은 PhET MIT 부품의 고정 묶음(`newSimBase`) 하나로 만든다 | 유지 |
| [0009](0009-korean-strings-in-en-file.md) | 새 시뮬레이션 화면 글자는 `_en` 파일에 한국어로 쓰고 빌드 때 `ko`로 복사한다 | 유지 |
| [0010](0010-browser-storage-only.md) | 학생 기록은 브라우저 저장소와 CSV·PNG 내보내기만(제출·로그인 없음) | 유지 |
| [0011](0011-public-repo-fresh-export.md) | 공개 저장소는 추적 파일을 새 기록으로 내보내 만든다(비공개 기록 공개 안 함) | 유지 |
| [0012](0012-korean-text-uses-device-fonts.md) | 한글은 웹 글꼴 없이 기기 글꼴로 그린다 | 유지 |
| [0013](0013-classic-cloudflare-pages.md) | 배포는 Cloudflare Pages 일반 프로젝트에 `dist/`만 직접 올린다 | 유지 |
