import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('detail', Path(__file__).with_name('municipal-detail-extract.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DetailTest(unittest.TestCase):
    def test_gumi_notice_requires_unique_title_license_and_preserves_period(self):
        source = 'https://www.gumi.go.kr/portal/board/post/view.do?idx=123'
        html = ('<div class="subject">산후조리비 지원사업</div><li class="view_date">등록일 2024-12-30</li>'
                '<div class="view_cont"><p>사업기간 : 2025. 1. ~ 12.</p><p>지원대상 주민</p>'
                '<p>지원내용 현금 30만원 신청기간 출산 후 1년 이내</p></div>'
                '<img alt="공공누리 제1유형: 출처표시">').encode()
        item = m.extract(html, source, '산후조리비 지원사업')['items'][0]
        self.assertEqual(item['location'], {'elementClass': 'view_cont'})
        self.assertIn('2025. 1. ~ 12.', item['content'])
        self.assertIn('등록일: 2024-12-30', item['content'])
        scripted = html.replace(b'</div><img', b'<script>malicious instruction</script></div><img')
        self.assertNotIn('malicious instruction', m.extract(scripted, source, '산후조리비 지원사업')['items'][0]['content'])
        self.assertEqual(m.extract(html.replace('제1유형'.encode(), '제4유형'.encode()), source, '산후조리비 지원사업')['items'], [])
        self.assertEqual(m.extract(html.replace(b'<li class="view_date">', b'<div class="subject">duplicate</div><li class="view_date">'), source, '산후조리비 지원사업')['items'], [])
        self.assertEqual(m.extract(html, source, '다른 사업')['items'], [])
        self.assertEqual(m.extract(html, source.replace('www.gumi.go.kr', 'www.nowon.kr'), '산후조리비 지원사업')['items'], [])

    def test_gumi_deadline_notice_retains_closing_date(self):
        html = ('<div class="subject">청년월세 조기마감 안내</div><li class="view_date">등록일 2026-04-02</li>'
                '<div class="view_cont">2026년 청년월세 지원사업은 2026. 4. 17. 마감되오니 신청 접수에 착오 없으시기 바랍니다.</div>'
                '<img alt="공공누리 제1유형: 출처표시">').encode()
        source = 'https://www.gumi.go.kr/portal/board/post/view.do?idx=123'
        self.assertIn('4. 17. 마감', m.extract(html, source, '청년월세 조기마감 안내')['items'][0]['content'])

    def test_seongnam_notice_keeps_extension_and_rejects_ambiguous_dates(self):
        source = 'https://www.seongnam.go.kr/bbs010101/405225'
        html = ('<div class="board-view-head">「산후조리 지원사업」 종료 안내</div>'
                '<div class="board-view-table">등록일 2026-09-10</div>'
                '<div class="board-view-content">2026년 10월 1일 사업 종료 예정. 2026년 9월 30일 지침에 따라 접수 연장 중입니다.</div>'
                '<div class="board-view-table">첨부</div><img alt="공공누리 제1유형: 출처표시">').encode()
        item = m.extract(html, source, '산후조리 지원사업 종료 안내')['items'][0]
        self.assertEqual(item['location'], {'elementClass': 'board-view-content'})
        self.assertIn('접수 연장 중', item['content'])
        self.assertEqual(m.extract(html.replace('첨부'.encode(), '2026-10-01'.encode()), source, '산후조리 지원사업 종료 안내')['items'], [])
        self.assertEqual(m.extract(html.replace('제1유형'.encode(), '제4유형'.encode()), source, '산후조리 지원사업 종료 안내')['items'], [])

    def test_ansan_explicit_content_requires_license_and_unique_body(self):
        source = 'https://www.ansan.go.kr/iloveyou/sub/contents.do?c1=3&c3=22'
        html = ('<title>경기도 산후조리비 지원</title><div class="con_wrap">지원대상자 경기도 거주 출산가정 '
                '지원금액 출생아 1인당 50만원 신청기간 출생 후 12개월 이내. 공공누리 제1유형: 출처표시</div>').encode()
        item = m.extract(html, source, '경기도 산후조리비 지원')['items'][0]
        self.assertEqual(item['location'], {'elementClass': 'con_wrap'})
        self.assertIn('50만원', item['content'])
        self.assertEqual(m.extract(html.replace('제1유형'.encode(), '제4유형'.encode()), source, '경기도 산후조리비 지원')['items'], [])
        self.assertEqual(m.extract(html + '<div class="con_wrap">다른 본문</div>'.encode(), source, '경기도 산후조리비 지원')['items'], [])
        self.assertEqual(m.extract(html, source.replace('www.ansan.go.kr', 'www.nowon.kr'), '경기도 산후조리비 지원')['items'], [])

    def test_yongin_notice_uses_unique_bounded_scope_and_keeps_copayment(self):
        source = 'https://www.yongin.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1001'
        html = ('<div class="title">다른 제목</div><div class="t_view"><td class="title">반려동물 지원사업</td>'
                '<tr id="activeTr"><td>등록일 2026-02-04</td></tr><td class="tview_desc">지원대상 취약가구 '
                '지원내용 의료비 최대 20만원 자부담 20% 포함, 검진비 최대 40만원 지원.</td></div>'
                '<img alt="공공누리 제1유형: 출처표시">').encode()
        item = m.extract(html, source, '반려동물 지원사업')['items'][0]
        self.assertEqual(item['location'], {'elementClass': 'tview_desc'})
        self.assertIn('자부담 20%', item['content'])
        self.assertNotIn('다른 제목', item['content'])
        self.assertEqual(m.extract(html + '<div class="t_view"></div>'.encode(), source, '반려동물 지원사업')['items'], [])
        self.assertEqual(m.extract(html.replace('제1유형'.encode(), '제4유형'.encode()), source, '반려동물 지원사업')['items'], [])

    def test_yongin_prose_requires_target_amount_and_licence(self):
        source = 'https://www.yongin.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1020'
        html = ('<div class="t_view"><td class="title">청년 이사비 지원</td>'
                '<tr id="activeTr"><td>등록일 2026-07-07</td></tr><td class="tview_desc">'
                '지원 대상은 무주택 청년이다. 선정되면 이사비를 최대 40만원 한도로 지원한다.</td></div>'
                '<img alt="공공누리 제1유형: 출처표시">').encode()
        item = m.extract(html, source, '청년 이사비 지원')['items'][0]
        self.assertIn('최대 40만원', item['content'])
        self.assertEqual(m.extract(html.replace('지원 대상은'.encode(), '대상은'.encode()), source, '청년 이사비 지원')['items'], [])
        self.assertEqual(m.extract(html.replace('최대 40만원'.encode(), '40만원'.encode()), source, '청년 이사비 지원')['items'], [])
        self.assertEqual(m.extract(html.replace('제1유형'.encode(), '제4유형'.encode()), source, '청년 이사비 지원')['items'], [])

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
