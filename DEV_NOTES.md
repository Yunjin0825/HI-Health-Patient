# DEV_NOTES.md

협업 중 발생한 이슈, 진행 중인 작업, 프로젝트 컨벤션을 기록하는 파일.
> 새 항목은 각 섹션 맨 위에 추가 (최신순 유지)

---

## 🐛 오류 / 이슈

<!-- 형식:
### [YYYY-MM-DD] 제목
**증상**: 어떤 문제가 발생했는지
**원인**: 왜 발생했는지
**해결**: 어떻게 해결했는지 (미해결이면 "미해결" 표기)
**관련 파일**: 파일명:라인
-->

### [2026-03-23] runday 참여자 목록 0건 표시 (400 Bad Request)
**증상**: user-admin에서 5건 확인되는데 runday에서 참여자 목록이 빈 화면
**원인**: `fetchChallengePeopleRows`에서 `select=...,registeredAt,...&order=registeredAt.desc` 쿼리 시 400 반환. DB 실제 컬럼명이 `registeredAt`(camelCase)이 아님. avatar 컬럼 없을 때 재시도 로직이 있지만 재시도에도 `registeredAt`이 남아있어 또 400 → 결국 rows = null
**해결**: `registrations` 테이블의 컬럼명이 camelCase가 아닌 소문자(`empid`, `deviceid`, `registeredat`)임을 확인. select/order/filter 전체를 소문자로 수정, 데이터 수신 후 camelCase로 정규화. `normalizeStoredRegRow`도 소문자 폴백 추가
**관련 파일**: `index.html:13606-13610`, `runday.html:3612-3616`, `runday.html:2434(normalizeStoredRegRow)`

### [2026-03-23] CHALLENGE_CONFIG 무한 루프 (Maximum call stack size exceeded)
**증상**: 챌린지 탭 진입 시 콘솔에 Maximum call stack size exceeded 폭발
**원인**: 인라인 모드에서 `postToRunday`가 `window.dispatchEvent(MessageEvent)`로 메시지를 보내면, `runday.html` 리스너 외에 `index.html`의 message 리스너도 `CHALLENGE_CONFIG`를 수신 → `handleChallengeConfigSyncPayload` 재진입 → 무한루프
**해결**: `index.html`의 `window.addEventListener('message', ...)` 에서 `CHALLENGE_CONFIG` 처리 라인 제거. runday.html은 CHALLENGE_CONFIG를 부모에게 보내지 않으므로 cross-tab 동기화(storage 이벤트)에 영향 없음
**관련 파일**: `index.html:16855`

### [2026-03-20] workout 삭제 시 string id 비교 오류
**증상**: 특정 운동 기록이 삭제되지 않음
**원인**: `workouts.id`가 문자열인데 `===` 엄격 비교로 숫자와 매칭 실패
**해결**: `==` 또는 `String(id)` 명시적 변환으로 수정
**관련 파일**: `index.html` (workout delete 핸들러)

---

## 🚧 작업 (Task)

<!-- 형식:
### #N [상태] [YYYY-MM-DD] 작업 제목 — 담당자
상태: 🔵 진행중 | ✅ 완료 | ⏸️ 보류
**목표**: 무엇을 하려는지
**현재 상태**: 어디까지 됐는지
**다음 단계**: 뭘 해야 하는지 (완료 시 생략)
**관련 파일**: 파일명
-->

### #1 🔵 진행중 [2026-03-23] runday 참여자 목록 표시 버그 수정
**목표**: user-admin에서 5건 확인되는 챌린지 신청이 runday 화면에도 정상 표시되게 하기
**현재 상태**:
- `CHALLENGE_CONFIG` 무한루프 수정 완료 (index.html 메시지 리스너)
- SELECT/filter 컬럼명 소문자 수정 완료 (`empid`, `deviceid`)
- `normalizeStoredRegRow` 소문자 폴백 추가 완료
- **아직 실제 브라우저에서 목록 표시 여부 미확인** — 오늘 세션 종료 전 테스트 못함
**다음 단계**:
1. 브라우저에서 챌린지 탭 진입 → 콘솔에 400 에러 사라졌는지 확인
2. 참여자 아바타/카운트가 정상 표시되는지 확인
3. 만약 아직 400이면 콘솔에 `[fetchChallengePeopleRows] 400 error:` 로그 내용 확인 → 남은 문제 컬럼 파악
4. Supabase 대시보드에서 `registrations` 테이블 컬럼명 직접 확인 권장 (다른 camelCase 컬럼 있을 수 있음)
**관련 파일**: `index.html`, `runday.html`

---

## 📐 컨벤션

### 코드 스타일
- JS: 세미콜론 없음, 작은따옴표 선호
- 함수명: camelCase
- 상수: UPPER_SNAKE_CASE

### 데이터 처리
- `workouts.id`는 항상 문자열로 취급 (`String(id)` 변환 후 비교)
- Supabase 조회 시 `push_subscriptions` 알림 필터: `enabled = true OR permission = 'granted'`
- 챌린지 인원 수는 클라이언트 캐시 무시, 서버 응답을 권위적 소스로 사용
- `registrations` 테이블 컬럼명은 소문자(`empid`, `deviceid`, `registeredat`). JS에서 camelCase로 정규화해서 사용. 필터/select 쿼리 문자열에도 소문자로 작성할 것

### 백엔드 선택 기준
- 신규 기능: Supabase 우선
- 레거시 데이터(주문, 구글 시트 연동): Code.gs 유지
- Edge Function 추가 시 `supabase/functions/` 하위에 새 디렉토리 생성

### 서비스 워커
- 캐시 버전 업 필요 시 `sw.js` 상단 `hi-health-v{N}` 번호 증가
- 새 정적 에셋 추가 시 캐시 목록에도 추가

### 배포
- main 브랜치 push = 즉시 운영 배포. 미완성 코드 push 금지
- Edge Function 변경 시 `supabase functions deploy {함수명}` 별도 실행 필요

---

## 💬 결정 사항 (Decision Log)

<!-- 왜 이렇게 만들었는지 기록. 나중에 "왜 이렇게 했지?" 방지용 -->

### [2026-03-20] 챌린지 인원 서버 권위 방식 채택
클라이언트 캐시와 서버 데이터 불일치 문제 반복 발생 → 챌린지 참가 인원은 항상 서버 응답으로 덮어씌우는 방식으로 통일.
