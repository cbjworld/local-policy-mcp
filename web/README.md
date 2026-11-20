# 이웃정책 웹

[웹사이트 이용하기](https://ieut-policy-search.onrender.com/)

정부24 서비스 목록, 2026년 지자체 일반회계 세출 예산행, 정보공개포털 문서 제목을 검색하고 공식 출처로 이동합니다. 정부24 목록은 2026년 11월 10일 수집 자료입니다. 정보공개포털 문서 검색은 2020년부터 오늘까지를 조회하며, 포털 점검 중에는 연결 상태를 안내합니다. 문서 제목은 사업의 현재 시행 여부를 뜻하지 않습니다.

## 실행

Node.js 22.19 이상이 필요합니다. 저장소 루트에서 다음 명령을 실행합니다.

```bash
node build-budget-index.cjs
node --use-system-ca web/server.cjs
```

브라우저에서 `http://127.0.0.1:4174`를 엽니다. Render 무료 웹 서비스에서는 빌드 명령에 `node build-budget-index.cjs`, 시작 명령에 `node --use-system-ca web/server.cjs`를 사용합니다. 무료 서버는 한동안 요청이 없으면 대기 상태로 전환됩니다.
