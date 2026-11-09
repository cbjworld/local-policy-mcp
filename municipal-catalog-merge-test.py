import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('merger', Path(__file__).with_name('municipal-catalog-merge.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SOURCE = 'https://www.nowon.kr/test'


def snapshot(count, digest='a', source=SOURCE):
    return {'source': source, 'sha256': digest * 64, 'skipped': [], 'items': [
        {'name': f'사업 {i}', 'content': f'내용 {i}', 'source': source, 'location': {'table': 1, 'row': i + 2}}
        for i in range(count)]}


class CatalogMergeTest(unittest.TestCase):
    def test_newly_skipped_rows_do_not_replace_previous_snapshot(self):
        old = snapshot(4)
        candidate = snapshot(3, 'b')
        candidate['skipped'] = [{'table': 1, 'row': 5, 'reason': 'rowspan'}]
        result, report = m.merge({'sources': [old]}, [('incomplete', candidate)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'review_required')
        self.assertEqual(result['sources'][0], old)

    def test_skipped_previous_group_is_preserved_even_when_new_rows_offset_it(self):
        old = snapshot(2)
        old['items'][0]['location']['rowEnd'] = 3
        candidate = snapshot(3, 'b')
        candidate['items'] = candidate['items'][1:]
        candidate['items'].append({'name': '새 사업', 'content': '새 내용', 'source': SOURCE, 'location': {'table': 2, 'row': 2}})
        candidate['skipped'] = [{'table': 1, 'row': 3, 'reason': 'rowspan'}]
        old['skipped'] = [{'table': 2, 'row': 9, 'reason': 'rowspan'}]
        result, report = m.merge({'sources': [old]}, [('incomplete', candidate)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'review_required')
        self.assertEqual(result['sources'][0], old)

    def test_gyeyang_notice_location_is_restricted_to_detail_path(self):
        url = 'https://www.gyeyang.go.kr/open_content/main/bbs/bbsMsgDetail.do?msg_seq=16'
        source = snapshot(1, source=url)
        source['items'][0]['location'] = {'elementClass': 'con'}
        _, report = m.merge({'sources': []}, [('notice', source)], {'www.gyeyang.go.kr'})
        self.assertEqual(report[0]['status'], 'added')
        source['source'] = source['items'][0]['source'] = url.replace('bbsMsgDetail.do', 'elsewhere.do')
        _, report = m.merge({'sources': []}, [('wrong-path', source)], {'www.gyeyang.go.kr'})
        self.assertEqual(report[0]['status'], 'invalid')

    def test_preserves_previous_on_bad_or_sparse_update(self):
        old = snapshot(4)
        low = snapshot(1, 'b')
        invalid = snapshot(2, 'c', 'https://evil.example/test')
        new = snapshot(2, 'd', 'https://www.gccity.go.kr/test')
        result, report = m.merge({'sources': [old]}, [('low', low), ('invalid', invalid), ('new', new)], {'www.nowon.kr', 'www.gccity.go.kr'})
        self.assertEqual([r['status'] for r in report], ['review_required', 'invalid', 'added'])
        self.assertEqual(result['sources'][0], old)
        self.assertEqual(result['sources'][1], new)

    def test_corrected_extraction_of_same_original_is_not_discarded(self):
        old = snapshot(1)
        corrected = copy.deepcopy(old)
        corrected['items'][0]['content'] = '수정된 사업내용'
        result, report = m.merge({'sources': [old]}, [('corrected', corrected)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'updated')
        self.assertEqual(result['sources'][0]['items'][0]['content'], '수정된 사업내용')
        same = copy.deepcopy(corrected)
        same['extractedAt'] = 'different extraction time'
        _, report = m.merge(result, [('same', same)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'unchanged')

    def test_rejects_duplicate_locations(self):
        bad = snapshot(2)
        bad['items'][1]['location'] = bad['items'][0]['location']
        result, report = m.merge({'sources': []}, [('bad', bad)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'invalid')
        self.assertEqual(result['sources'], [])

    def test_section_locations_are_valid_and_mixed_locations_rejected(self):
        source = snapshot(1)
        source['items'][0]['location'] = {'section': 2}
        result, report = m.merge({'sources': []}, [('section', source)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'added')
        mixed = copy.deepcopy(source)
        mixed['items'][0]['location']['table'] = 1
        _, report = m.merge(result, [('mixed', mixed)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'invalid')

    def test_gumi_notice_location_requires_official_board_and_no_mixed_location(self):
        url = 'https://www.gumi.go.kr/portal/board/post/view.do?idx=1'
        source = snapshot(1, source=url)
        source['items'][0]['location'] = {'elementClass': 'view_cont'}
        _, report = m.merge({'sources': []}, [('notice', source)], {'www.gumi.go.kr'})
        self.assertEqual(report[0]['status'], 'added')
        source['items'][0]['location']['row'] = 2
        _, report = m.merge({'sources': []}, [('mixed', source)], {'www.gumi.go.kr'})
        self.assertEqual(report[0]['status'], 'invalid')
        other = snapshot(1)
        other['items'][0]['location'] = {'elementClass': 'view_cont'}
        _, report = m.merge({'sources': []}, [('other', other)], {'www.nowon.kr'})
        self.assertEqual(report[0]['status'], 'invalid')

    def test_explicit_detail_element(self):
        for element in ('contents', 'conts', 'content', 'body_content'):
            source = snapshot(1)
            source['items'][0]['location'] = {'elementId': element}
            _, report = m.merge({'sources': []}, [('detail', source)], {'www.nowon.kr'})
            self.assertEqual(report[0]['status'], 'added')


if __name__ == '__main__':
    unittest.main()
