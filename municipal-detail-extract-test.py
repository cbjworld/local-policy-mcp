import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('detail', Path(__file__).with_name('municipal-detail-extract.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DetailTest(unittest.TestCase):
    def test_bounded_content_with_unclosed_list_item(self):
        html = '''<html><head><title>청년 지원사업 : 구청</title></head><body>
        <div id="contents"><h3>지원대상</h3><ul><li>관내 청년</li></ul><h3>지원내용</h3>
        <ul><li>최대 십만원 지원 및 관내 청년의 경제적 부담을 줄이기 위한 지원 사업입니다. <li>기타 조건 확인</li></ul></div><div>본문 밖 내용</div></body></html>'''.encode()
        x = m.extract(html, 'https://www.nowon.kr/test', '청년 지원사업')
        self.assertEqual(len(x['items']), 1)
        self.assertNotIn('본문 밖 내용', x['items'][0]['content'])
        self.assertEqual(x['items'][0]['location'], {'elementId': 'contents'})
        self.assertEqual(m.extract(html, 'https://www.nowon.kr/test', '다른 사업')['items'], [])

    def test_duplicate_content_id_is_rejected(self):
        html = '<title>지원사업</title><div id="contents">지원대상 청년 지원내용 십만원 지원 추가 안내 추가 안내 추가 안내 추가 안내</div><div id="contents">다른 내용</div>'.encode()
        self.assertEqual(m.extract(html, 'https://www.nowon.kr/test', '지원사업')['items'], [])

    def test_other_content_ids_and_nested_specific_body(self):
        for element in ('content', 'conts', 'body_content'):
            html = f'<title>지원사업</title><div id="{element}">지원대상 청년 지원내용 십만원 지원 추가 안내 추가 안내 추가 안내 추가 안내</div>'.encode()
            self.assertEqual(m.extract(html, 'https://www.nowon.kr/test', '지원사업')['items'][0]['location'], {'elementId': element})
        nested = '<title>지원사업</title><div id="content">메뉴<div id="conts">지원대상 청년 지원내용 십만원 지원 추가 안내 추가 안내 추가 안내 추가 안내</div>바깥</div>'.encode()
        result = m.extract(nested, 'https://www.nowon.kr/test', '지원사업')['items'][0]
        self.assertEqual(result['location'], {'elementId': 'conts'})
        self.assertNotIn('바깥', result['content'])

    def test_support_eligibility_and_amount_labels(self):
        html = '<title>면허 반납 지원</title><div id="conts">지원자격 만 70세 이상 주민 지원내용 상품권 10만원 또는 20만원을 지급합니다. 자세한 신청 절차를 확인하세요.</div>'.encode()
        self.assertEqual(len(m.extract(html, 'https://www.nowon.kr/test', '면허 반납 지원')['items']), 1)
        html = '<title>귀농 지원</title><div id="body_content">사업대상자 요건 귀농인 지원분야 농업 창업 및 주택 구입을 위한 상세한 안내가 포함되어 있습니다.</div>'.encode()
        self.assertEqual(len(m.extract(html, 'https://www.nowon.kr/test', '귀농 지원')['items']), 1)

    def test_child_service_population_label(self):
        html = '<title>지역아동센터 지원사업</title><div id="contents">지역아동센터의 사업내용 아동 보호와 학습 지도 등 서비스를 제공합니다. 이용아동 지역사회 내 보호가 필요한 만 18세 미만 아동입니다.</div>'.encode()
        result = m.extract(html, 'https://www.ddc.go.kr/test', '지역아동센터 지원사업')
        self.assertEqual(len(result['items']), 1)
        self.assertIn('18세 미만', result['items'][0]['content'])
        self.assertEqual(m.extract(html, 'https://www.ddc.go.kr/test', '다른 사업')['items'], [])

    def test_generic_title_requires_unique_matching_main_heading(self):
        html = '<title>시청</title><h1>청년 지원</h1><div id="body_content">지원대상 청년 지원범위 의료비를 지원하고 신청에 필요한 상세 조건을 안내합니다.</div>'.encode()
        self.assertEqual(len(m.extract(html, 'https://www.nowon.kr/test', '청년 지원')['items']), 1)
        self.assertEqual(m.extract(html.replace(b'<div', '<h1>청년 지원</h1><div'.encode()), 'https://www.nowon.kr/test', '청년 지원')['items'], [])


if __name__ == '__main__':
    unittest.main()
