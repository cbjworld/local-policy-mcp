# 정책 MCP

## 다른 지자체는 어떻게 했을까?

정보공개포털의 지자체 사업 문서를 AI에서 검색하고, **계획·예산·지원 조건을 원문 근거와 함께 확인**합니다.

새 사업을 준비하며 다른 지역 사례를 찾는 공무원과 정책 연구자를 위한 도구입니다. 문서 검색과 첨부파일 읽기를 연결해, AI와 대화하면서 사례를 비교할 수 있습니다.

**실험적 로컬 MCP · 별도 검색 API 키 불필요 · PDF / HWP / HWPX 텍스트 읽기**

[설치하기](#설치) · [실제 비교 예시](#실제-비교-예시) · [범위와 한계](#범위와-한계)

## 이렇게 질문하세요

> 다른 지자체 산후조리비 지원 사업 찾아줘.
>
> 지원금과 사업 예산, 거주 조건을 비교해줘.
>
> 계획 중인 사업은 따로 보여줘. 원문 근거도 보여줘.

제목에서 사업 존재가 추정되면 비공개·읽기 실패 문서도 포함합니다. **제목 근거**, **본문 근거**, **미확인 정보**를 구분하며, 계획안이 현재 시행이나 예산 확정을 뜻하지는 않습니다.

## 실제 비교 예시

산후조리비 관련 문서를 2026년 10월 14일 조회해 비교한 예시입니다. 여러 차례 원문을 추가 조회하고 AI가 문맥을 검토한 결과로, 한 번의 호출 결과나 현재 신청 가능 여부를 뜻하지 않습니다.

| 지역 | 문서에서 확인한 지원 내용 | 예산과 상태 | 원문 |
|---|---|---|---|
| 인제군 | 2026년 실비 최대 100만원으로 상향 계획 | 소요액 1억8천만원. 첨부 본예산은 9천만원이며 추경 확보 계획과 구분 | [계획 2·3·5·6쪽](https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT434E9006AA0F21F483966A46BDCCFB36&prdnDt=20260128085650&nstSeCd=B) |
| 부산시 | 2026년 출생아당 최대 100만원. 산후조리원 사용은 한도의 50% | 계획서상 110억원, 시비·구군비 각 55억원 | [계획 1·5·6쪽](https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT49DC81DDBEA29DA4EA443BED60DF7D77&prdnDt=20260112152324&nstSeCd=W) |
| 경기도 | 2026년 안내(안): 출생아당 50만원 지역화폐 | 총예산 미확인. 도·시군 분담률 각 50% 확인 | [첨부 사업 안내](https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCT49874D3344E5B5A628EAF053268655A9&prdnDt=20251229160401&nstSeCd=W) |
| 강원 고성군 | 80만원에서 180만원으로 증액 계획 | 소요액 1억8천만원. **2027년 시행·본예산 반영 계획** | [계획 1·3·4쪽](https://www.open.go.kr/othicInfo/infoList/infoListDetl.do?prdnNstRgstNo=DCTB0E1DC06B005B1D065C089DE9A7C5294&prdnDt=20260410155243&nstSeCd=B) |

**같은 금액이라도 의미가 다릅니다.** 개인별 지원금과 전체 사업비, 이미 편성된 예산과 증액 계획을 나누고 확인하지 못한 값은 미확인으로 남깁니다. 경기도의 이후 변경·종료 여부 등 최신 시행 상태는 별도 확인이 필요합니다.

쓸모 있었다면 저장소 상단의 **Star**로 관심을 남겨주세요. 실제 업무에서 잘됐던 질문이나 잘못 찾은 문서는 Issues로 알려주시면 개선에 도움이 됩니다.

## 설치

Node.js 22.19 이상, Python 3.10 이상, Git이 필요합니다. stdio MCP를 지원하는 AI 앱에서 실행합니다. 서버 자체는 AI 답변을 생성하지 않으며 연결한 AI가 근거를 해석합니다.

```sh
git clone https://github.com/cbjworld/policy-mcp.git
cd policy-mcp
npm ci --ignore-scripts --omit=optional
python -m venv .venv
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

macOS/Linux에서는 위의 `python` 대신 `python3`로 환경을 만들고 다음을 실행하세요.

```sh
.venv/bin/python -m pip install -r requirements.txt
```

AI 앱의 MCP 설정에 아래 항목을 추가합니다. 두 경로는 실제 설치 폴더의 **절대 경로**로 바꾸세요. macOS/Linux의 Python 경로는 `/설치폴더/.venv/bin/python`입니다.

```json
{
  "mcpServers": {
    "policy-mcp": {
      "command": "node",
      "args": ["--use-system-ca", "C:/설치폴더/policy-mcp/mcp.js"],
      "env": {
        "POLICY_PYTHON": "C:/설치폴더/policy-mcp/.venv/Scripts/python.exe"
      }
    }
  }
}
```

앱을 완전히 종료한 뒤 다시 실행하고 `research_policy`로 질문하세요. `npm start`는 stdio 요청을 기다리므로 화면에 아무것도 나오지 않는 것이 정상입니다. 공개 URL로 접속하는 원격 서버는 제공하지 않습니다.

## 제공 도구

| 도구 | 역할 |
|---|---|
| research_policy | 짧은 질문으로 검색·선별·일부 원문 조회 |
| search_open_documents | 기간·페이지·공개 범위를 지정한 문서 검색 |
| research_open_document | 첨부 선택 및 근거 후보 추출 |
| read_open_document | 특정 첨부·페이지 조회 |
| read_official_source | 공식 URL 텍스트 조회 |
| research_official_notice | 공식 공고 및 직접 연결된 첨부 조회 |
| build_research_brief | 읽은 원문의 인용문 일치 확인과 비교 초안 |

## 범위와 한계

- 기본 검색 기간은 최근 2년입니다. `research_policy`는 검색어 최대 3개, 각 2페이지, 원문 최대 4개를 조회합니다. 전국 전수검색이 아닙니다.
- 비공개 본문을 우회하지 않습니다. `search_open_documents`의 `scope: "all"`은 비공개 문서의 공개된 목록 정보도 찾습니다. 기본 검색은 원문공개 목록 중심입니다.
- OCR은 없습니다. 이미지 PDF·암호화·다운로드 불가 파일은 읽지 못할 수 있습니다. PDF는 일부 페이지만 반환할 수 있고 HWP의 쪽 번호는 제공하지 않습니다.
- 표 해석·사업 귀속·관련성은 휴리스틱과 연결한 AI의 판단에 의존합니다. 읽기 성공이나 인용문 일치는 사실 정확성 보증이 아닙니다.
- 계획액·본예산·추경 요구·집행액과 다른 지역 참고 금액을 구분해야 합니다. 최신 변경·종료 여부는 별도 확인하세요.
- 문서는 HTTPS 공식 도메인으로 제한하고 다운로드 크기·시간을 제한합니다. 외부 문서를 로컬 파서로 처리하므로 격리된 일반 사용자 환경에서 실행하는 것을 권장합니다. 원문은 AI 앱에 전달되며 해당 앱의 데이터 처리 정책이 적용됩니다.
- 웹사이트 전체 검색, 정부24 다운로드 데이터, 기존 웹 UI, 원격 호스팅은 이 공개판에 포함하지 않습니다.

## 검증

```sh
npm test
```

합성 입력 기반 회귀 검사와 stdio 초기화·도구 목록 검사를 실행합니다. 실서비스 연결이나 전국 검색 정확도를 측정하는 테스트는 아닙니다. Windows에서 설치·실행 검증하며 다른 OS는 아직 실기 검증하지 않았습니다.

초기 내부 실험에서 새로운 질문 10개 중 8개에 유용한 정책 근거를 찾았지만, 같은 AI가 검토한 소규모 실험이므로 정확도 80%라는 의미가 아닙니다.

## 기여와 라이선스

잘못 분류된 문서나 설치 문제는 Issues에 질문·공식 URL·기대 결과를 남겨주세요. API 키, 개인정보, 비공개 원문은 올리지 마세요.

코드는 MIT 라이선스입니다. 공공 문서는 배포하지 않으며 원문 이용조건은 제공기관의 조건을 따릅니다. HWP/HWPX 처리는 MIT 라이선스의 Kordoc, PDF 처리는 pypdf를 사용합니다. 의존성은 각자의 라이선스를 따릅니다.
