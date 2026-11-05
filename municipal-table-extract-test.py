import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('extractor', Path(__file__).with_name('municipal-table-extract.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TestMunicipalTable(unittest.TestCase):
    def test_rows_preserve_origin_and_do_not_mix_programs(self):
        data = b'''<html><table><tr><th>ignore</th></tr></table>
        <table><tr><th>\xec\x82\xac\xec\x97\x85\xeb\xaa\x85</th><th>\xec\x82\xac\xec\x97\x85\xeb\x82\xb4\xec\x9a\xa9</th><th>\xeb\x8b\xb4\xeb\x8b\xb9\xeb\xb6\x80\xec\x84\x9c</th></tr>
        <tr><td>A<br>one</td><td><ul><li>first<ul><li>nested</li></ul></li></ul><script>bad</script></td><td>dept</td></tr>
        <tr><td>B</td><td>second</td><td>other</td></tr></table></html>'''
        result = module.extract(data, 'https://www.nowon.kr/example')
        self.assertEqual([x['name'] for x in result['items']], ['A one', 'B'])
        self.assertEqual(result['items'][0]['content'], 'first nested')
        self.assertEqual(result['items'][1]['location'], {'table': 2, 'row': 3})
        self.assertEqual(result['items'][0]['source'], 'https://www.nowon.kr/example')

    def test_merged_table_is_reported_instead_of_inventing_rows(self):
        data = '<table><tr><th>사업명</th><th>사업내용</th></tr><tr><td rowspan="2">A</td><td>B</td></tr></table>'.encode()
        result = module.extract(data, 'https://example.go.kr/notice')
        self.assertEqual(result['items'], [])
        self.assertEqual(result['skipped'][0]['reason'], 'merged_or_duplicate_headers')
        with self.assertRaises(ValueError):
            module.extract(data, 'http://example.go.kr/')

    def test_row_headers_extra_columns_and_application_links(self):
        data = '<table><tr><th>사업명</th><th>사업내용</th><th>지원내용</th><th>바로가기</th></tr><tr><th scope="row">병원동행</th><td>동행</td><td>5,000원</td><td><a href="/apply">신청</a></td></tr></table>'.encode()
        result = module.extract(data, 'https://www.gccity.go.kr/program')
        self.assertEqual(result['items'][0]['fields']['지원내용'], '5,000원')
        self.assertEqual(result['items'][0]['links'], ['https://www.gccity.go.kr/apply'])


if __name__ == '__main__':
    unittest.main()
