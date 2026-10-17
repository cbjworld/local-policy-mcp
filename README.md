# local-policy-mcp

**지자체 정책검색 MCP**

다른 지자체의 사업·계획·예산을 AI에서 검색하고, 원문 근거와 함께 확인합니다.
새로운 사업을 준비하는 공무원과 정책 연구자를 위한 도구입니다.

## 주요 기능

- **정책 사례 검색** — 정보공개포털에서 지자체 사업·계획 문서를 찾습니다.
- **원문 읽기** — PDF·HWP·HWPX에서 계획, 예산, 지원 조건을 확인합니다.
- **예산 검색** — 2026년 본예산 일반회계 세출의 사업별 편성액을 조회합니다.
- **사례 비교** — 지역별 추진 내용과 예산을 원문 인용과 함께 비교합니다.

<!-- budget-stats:start -->
**2026년 본예산 일반회계 세출 사업행 276,101건 수록**
<!-- budget-stats:end -->

예산 검색 결과에는 편성액(천원)과 원문 위치가 함께 제공됩니다.

## 연결하기

Streamable HTTP를 지원하는 AI 앱에 아래 주소를 등록하세요.
로그인이나 별도 API 키 없이 연결할 수 있습니다.

```text
https://policy-mcp-production.up.railway.app/mcp
```

서버 이름: `local-policy-mcp` · 연결 방식: `Streamable HTTP`

Claude Code·Cursor 연결 방법은 [앱별 연결 안내](USAGE.md#claude-code)를 참고하세요.

## 이렇게 질문하세요

> 다른 지자체 산후조리비 지원 사업의 계획과 예산을 비교해줘.

> 청년 AI 구독료 지원 사업을 찾아줘. 원문도 함께 보여줘.

> 다른 지역 빈집 정비 사업의 편성 예산을 찾아줘.

## 더 알아보기

[설치·도구 안내](USAGE.md) · [의견 남기기](https://github.com/cbjworld/local-policy-mcp/issues) · [MIT 라이선스](LICENSE)
