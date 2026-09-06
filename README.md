# Bible Reading Plan V3

개역한글 본문과 KJV 1769, 히브리어와 헬라어 원어 자료를 함께 볼 수 있는 정적 성경 통독 앱입니다.

## 실행

`index.html`을 브라우저에서 직접 열어 사용할 수 있습니다. 유대력 5786~5789의 완전한 통독 주기와 개역한글 본문은 앱에 포함되어 있으므로 첫 실행도 별도 서버 없이 가능합니다. 5790 이후에는 인터넷 연결 시 Hebcal에서 달력 데이터를 받아 같은 방식으로 플랜을 생성합니다. GitHub Pages 정적 사이트로도 배포할 수 있습니다.

## 주요 기능

- 오늘의 통독과 토라 포션 일정
- 개역한글과 KJV 1769 병기
- 절 단위 히브리어와 헬라어 원문
- 원어 단어와 KJV Strong 대응어
- Strong 사전 정보와 Bible Hub 링크

## 데이터

- 개역한글: Korean-Bible-1961-KRV 정적 데이터 (대한성서공회 성경전서 개역한글판 표기 유지)
- KJV 1769 및 신약 원어: KJV1769x/Translator's Textus Receptus 계열 데이터
- 구약 원어: OpenHebrewBible BHSA 8-layer 및 공식 KJV 대응표
- 달력: Hebcal Jewish Calendar API 정적 스냅샷

상세 출처, 라이선스, 재생성 방법은 `tools/sources`와 `tools/build-*.js`에 보존되어 있습니다.

## 검증

`npm test`는 일정 경계와 전체 통독 배분, JavaScript 문법, 66권·1,189장·31,102절 커버리지, 모든 파라샤 의미, 원어 절 커버리지, 사전 의미 무결성, KJV Strong 위치를 검사합니다. 같은 검사는 GitHub Pages 배포 전에 자동 실행됩니다.
