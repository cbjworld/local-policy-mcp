# PDF 처리 라이브러리 보안 수정

공공 GitLab 보안 검사에서 탐지한 pypdf 6.21.2의 취약점에 대응해 6.21.4로 고정했습니다. 공식 권고에서 탐지 항목의 수정 버전을 확인했습니다. 예: [GHSA-5849-834g-hvw5](https://github.com/advisories/GHSA-5849-834g-hvw5), [GHSA-cggf-277g-3q54](https://github.com/advisories/GHSA-cggf-277g-3q54), [GHSA-42gh-23hr-vphw](https://github.com/advisories/GHSA-42gh-23hr-vphw).

기존 버전과 새 버전으로 실제 예산 PDF 20건, 52쪽의 쪽수와 추출 텍스트 해시를 비교해 모두 일치했습니다. OCR 쪽 처리와 의존성 누락 안내도 새 버전 환경에서 확인했습니다. PDF마다 구조가 다르므로 이 비교 결과가 모든 문서의 추출 결과 일치를 뜻하지는 않습니다.
