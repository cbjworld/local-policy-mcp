import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('sections', Path(__file__).with_name('municipal-section-extract.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SectionTest(unittest.TestCase):
    def test_explicit_sections_and_boundaries(self):
        html = '''<html><head><meta charset="utf-8"></head><body>
        <h4>navigation</h4><div class="spotWrap"><h4>청년월세</h4><div class="div">
        <ul><li>지원대상: 청년<br>무주택</li><li>지원내용: 20만원 <a href="https://www.bokjiro.go.kr/">신청</a></li></ul>
        <script>ignore</script></div><h4>별도 사업</h4><div class="div"><p>지원대상: 노인</p><p>지원내용: 돌봄</p></div>
        <h4>빈 사업</h4><div class="div">안내만 있음</div></div></body></html>'''.encode()
        x = m.extract(html, 'https://www.uiwang.go.kr/test')
        self.assertEqual([i['name'] for i in x['items']], ['청년월세', '별도 사업'])
        self.assertNotIn('노인', x['items'][0]['content'])
        self.assertNotIn('ignore', x['items'][0]['content'])
        self.assertEqual(x['items'][0]['links'], ['https://www.bokjiro.go.kr/'])
        self.assertEqual(x['items'][1]['location'], {'section': 2})
        self.assertEqual(x['skipped'], [{'section': 3, 'reason': 'missing_policy_labels'}])

    def test_condition_label_is_preserved_without_renaming_it(self):
        html = '<div class="spotWrap"><h4>취업 지원</h4><div class="div"><p>지원대상: 청년</p><p>지원조건: 실비 최대 100만원</p></div></div>'.encode()
        x = m.extract(html, 'https://www.uiwang.go.kr/test')
        self.assertEqual(len(x['items']), 1)
        self.assertIn('지원조건: 실비 최대 100만원', x['items'][0]['content'])
        self.assertNotIn('지원내용:', x['items'][0]['content'])

    def test_main_content_requires_target(self):
        html = '<div class="spotWrap"><h4>주거급여</h4><div class="div"><p>사업대상: 청년</p><p>주요내용: 주거급여 지급</p></div><h4>계획</h4><div class="div">주요내용: 계획 수립</div></div>'.encode()
        x = m.extract(html, 'https://www.uiwang.go.kr/test')
        self.assertEqual([i['name'] for i in x['items']], ['주거급여'])
        self.assertEqual(x['skipped'][0]['section'], 2)

    def test_accordion_sections_keep_each_body_and_link(self):
        html = '''<div class="temp_board"><ul>
        <li><div class="title"><div class="tit_text">청년 지원</div></div><div class="cont_text"><ul>
        <li>사업대상: 청년</li><li>사업내용: 지원금 <a href="/apply">신청</a></li></ul></div></li>
        <li><div class="title"><div class="tit_text">노인 지원</div></div><div class="cont_text">
        <ul><li>사업대상: 노인</li><li>사업내용: 돌봄</li></ul></div></li>
        <li><div class="title"><div class="tit_text">계획</div></div><div class="cont_text">자료 없음</div></li>
        </ul></div>'''.encode()
        x = m.extract(html, 'https://www.yangju.go.kr/test')
        self.assertEqual([i['name'] for i in x['items']], ['청년 지원', '노인 지원'])
        self.assertEqual(x['items'][0]['links'], ['https://www.yangju.go.kr/apply'])
        self.assertNotIn('노인', x['items'][0]['content'])
        self.assertEqual(x['items'][1]['location'], {'section': 2})
        self.assertEqual(x['skipped'], [{'section': 3, 'reason': 'missing_policy_labels'}])

    def test_sibling_headings_do_not_merge_policies(self):
        html = '''<div class="contentStyle"><h4>청소년 지원</h4><h5>대상</h5><p>청소년</p>
        <h5>지원내용</h5><p>생활비 <a href="/apply">신청</a></p><h4>청소년 물품</h4>
        <h5>지원대상</h5><p>여성 청소년</p><h5>지원내용</h5><p>물품 지원</p>
        <h4>청소년증</h4><p>발급 안내</p></div>'''.encode()
        x = m.extract(html, 'https://www.suncheon.go.kr/test')
        self.assertEqual([i['name'] for i in x['items']], ['청소년 지원', '청소년 물품'])
        self.assertNotIn('물품', x['items'][0]['content'])
        self.assertEqual(x['items'][0]['links'], ['https://www.suncheon.go.kr/apply'])
        self.assertEqual(x['items'][1]['location'], {'section': 2})
        self.assertEqual(x['skipped'], [{'section': 3, 'reason': 'missing_policy_labels'}])


if __name__ == '__main__':
    unittest.main()
