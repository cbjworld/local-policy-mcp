# 설치·도구 안내

## 원격 연결

| 항목 | 값 |
|---|---|
| 서버 이름 | `local-policy-mcp` |
| 연결 방식 | Streamable HTTP |
| 주소 | `https://policy-mcp-production.up.railway.app/mcp` |
| 인증 | 없음 |

연결한 AI 앱이 MCP의 검색·조회 결과를 바탕으로 답변을 작성합니다.

### Claude Code

터미널에서 한 번 등록하면 다른 프로젝트에서도 사용할 수 있습니다.

```sh
claude mcp add --transport http local-policy-mcp --scope user https://policy-mcp-production.up.railway.app/mcp
claude mcp get local-policy-mcp
```

프로젝트 단위로 연결하려면 [설정 예시](examples/claude-code.mcp.json)를 `.mcp.json`에 병합합니다. 연결 후 `/mcp`에서 상태를 확인하고 앱이 요청하는 사용 승인을 진행하세요. 브라우저의 Claude와 Claude Code는 사용하는 화면의 연결 설정을 확인해야 합니다. [Claude Code 공식 안내](https://code.claude.com/docs/en/mcp)

### Cursor

[설정 예시](examples/cursor.mcp.json)를 프로젝트의 `.cursor/mcp.json` 또는 사용자 홈의 `.cursor/mcp.json`에 병합한 뒤 MCP 설정 화면에서 연결을 확인합니다. 기존 서버 항목은 유지하세요. [Cursor 공식 안내](https://cursor.com/docs/mcp)

### 첫 질문

> 산후조리비 지원 사업 비교해줘.

도구 목록 조회만으로 실제 검색이 끝난 것은 아닙니다. AI가 `research_policy`를 호출하고, 원문 링크와 확인한 내용을 반환하는지 확인하세요.

## 제공 도구

| 도구 | 기능 |
|---|---|
| `research_policy` | 짧은 질문으로 정책 문서 검색·선별·원문 조회 |
| `search_open_documents` | 기간·페이지·공개 범위를 지정한 문서 검색 |
| `research_open_document` | 첨부파일 선택과 계획·예산 근거 추출 |
| `read_open_document` | 특정 첨부파일·페이지 읽기 |
| `read_official_source` | 공식 URL의 텍스트 읽기 |
| `research_official_notice` | 공식 공고와 연결된 첨부 읽기 |
| `build_research_brief` | 원문 인용문 대조와 사례 비교 초안 |
| `search_budget_projects` | 일반회계 세출 사업명·편성액 검색 |
| `search_verified_budget_totals` | 부서 합계와 공식 총액을 대조한 지자체 예산 조회 |

### 정책 문서 검색

짧은 질문은 `research_policy`로 시작합니다. 정보공개포털의 시·도, 시·군·구 문서를 검색하고 공개된 첨부의 기존 텍스트를 읽습니다.

결과에는 문서 역할, 원문 인용, 읽은 첨부와 페이지, 후속 검색 정보가 포함됩니다. 문서 제목으로 찾은 사례와 본문을 읽은 사례를 구분하고, 가린 금액은 가림 처리로 표시합니다.

`evidenceMap`은 기관·제목 연도별로 계획·방침, 예산 편성·변경, 교부·예탁, 집행·정산 문서를 나눠 다음에 읽을 자료를 안내합니다. 같은 사업으로 확정해 합치는 기능은 아니며 연도 미상 문서는 개별로 유지합니다. `compact`에서는 `documentIds`로 원문 목록을 참조하고, 생략한 묶음 수를 표시합니다. 교부결정액은 실제 집행액과 구분합니다.

읽은 HWP·HWPX의 재원·교부 표는 원문 인용과 함께 합계·교부잔액 산술 대조를 제공합니다. 본문에 사업명과 2026년 사업기간이 명시되고, 가까운 표의 단위가 천원이며 같은 기관 본예산 행의 사업명·금액이 맞으면 `budgetEvidenceLinks`로 연결합니다. 표의 산술 일치는 사업의 현재 시행이나 지급 실적 확인과 구분합니다. 계획서를 읽은 뒤에는 관련 기관의 재정 문서 한 건을 추가로 확인합니다.

`budgetCandidates`에는 같은 검색 표현으로 찾은 본예산 초기 후보를 최대 5행 제공합니다. 본문과 대조된 `budgetEvidenceLinks`와 구분하며, `budgetSearches`의 검색어와 다음 위치로 예산 조회를 이어갈 수 있습니다. 압축 응답은 읽은 근거를 우선 남기고 미열람 후보를 먼저 생략합니다.

`research_open_document`로 특정 문서를 더 읽거나 `build_research_brief`로 읽은 사례를 비교할 수 있습니다. 응답은 기본 `compact`, 전체 근거는 `detail: "full"`로 요청합니다.

### 예산 검색

`search_budget_projects`의 `q`에 사업명 키워드를 넣습니다. 공백으로 구분한 키워드는 모두 포함하는 조건입니다.

| 항목 | 사용법 |
|---|---|
| `q` | `빈집`, `청년 주거` 등 사업명 키워드 |
| `institution` | 지역명으로 검색 범위 지정 |
| `offset` | 이어서 조회할 시작 위치 |
| `limit` | 반환 행 수. 기본 10, 최대 20 |

검색 자료는 2026년 본예산의 **일반회계 세출**입니다. 특별회계·기금·세입·추경·예산안은 수록 대상에서 제외합니다. 일반회계에서 다른 회계로 전출하는 지출은 원문에 기재된 일반회계 지출로 다룹니다.

금액 단위는 **천원**, 금액의 종류는 **편성액**입니다. 사업별 편성액과 지자체 총액은 각각 다른 도구로 조회합니다. 검색 결과의 `scope`에 수록 지역과 자료 확인 범위가 표시됩니다.

수록 과정에서 사업행의 증감 산술과 부서 합계를 대조합니다. 서울시 본청의 별도 양식은 공식 당초 총액 및 별도 공식 자료의 사업명·금액을 대조했습니다.

PDF는 원문 링크와 쪽수, 한글 문서는 표·행 위치를 제공합니다. 대전 서구 일부 자료는 공식 문서뷰어의 기존 텍스트층을 사용하며 `sourceFormat`, `textSource`로 출처를 표시합니다. 예산 자료는 `budget-data.json.gz`에 저장합니다.

### 문서 처리

- PDF·HWP·HWPX의 기존 텍스트를 읽습니다. OCR은 사용하지 않습니다.
- 문서의 계획액, 본예산 편성액, 교부·집행 자료를 구분합니다.
- 정보공개포털 검색과 저장된 예산 자료 검색을 함께 제공합니다.

## 로컬 설치

Node.js 22.19 이상, Python 3.10 이상, Git이 필요합니다.

```sh
git clone https://github.com/cbjworld/local-policy-mcp.git
cd local-policy-mcp
npm ci --ignore-scripts --omit=optional
python -m venv .venv
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

macOS/Linux에서는 `python3`로 가상환경을 만들고 다음을 실행합니다.

```sh
.venv/bin/python -m pip install -r requirements.txt
```

stdio MCP를 지원하는 AI 앱의 설정에 추가합니다. 경로는 실제 설치 폴더의 절대 경로로 바꿉니다.

```json
{
  "mcpServers": {
    "local-policy-mcp": {
      "command": "node",
      "args": ["--use-system-ca", "C:/설치폴더/local-policy-mcp/mcp.js"],
      "env": {
        "POLICY_PYTHON": "C:/설치폴더/local-policy-mcp/.venv/Scripts/python.exe"
      }
    }
  }
}
```

macOS/Linux의 Python 경로는 `/설치폴더/.venv/bin/python`입니다. 설정 후 AI 앱을 다시 실행합니다. `npm start`는 stdio 요청을 기다리며, HTTP 서버는 `npm run start:http`로 실행합니다.

## 검사

```sh
npm test
```

도구 응답, 원문 인용, 문서 분류, 예산 검색, stdio·HTTP 연결을 검사합니다.

[소개로 돌아가기](README.md)

## 연도별 자료

현재 사업행 검색에는 2026년 본예산 일반회계 세출이 들어 있습니다. 검색 기간은 정보공개포털 문서 기간이며 예산 데이터의 연도와 별개입니다. 새 연도 예산은 별도로 수집·검증해 추가합니다. 문서와 예산 행은 같은 연도끼리 대조하며, 연도가 바뀌었다고 기존 자료를 새 연도 자료로 취급하지 않습니다.
