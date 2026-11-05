import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('batch', Path(__file__).with_name('municipal-batch-extract.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class BatchTest(unittest.TestCase):
    def test_failed_page_keeps_old_and_other_page_is_added(self):
        directory = tempfile.mkdtemp(prefix='municipal-batch-')
        try:
            f = Path(directory) / 'page.html'
            f.write_text('<table><tr><th>사업명</th><th>사업내용</th></tr><tr><td>새 사업</td><td>새 내용</td></tr></table>', encoding='utf-8')
            old_url = 'https://www.nowon.kr/old'
            old = {'source': old_url, 'sha256': 'a' * 64, 'items': [{'source': old_url, 'name': '이전 사업', 'content': '이전 내용', 'location': {'table': 1, 'row': 2}}], 'skipped': []}
            manifest = [{'source': old_url, 'file': str(Path(directory) / 'missing.html'), 'parser': 'table'},
                        {'source': 'https://www.gccity.go.kr/new', 'file': str(f), 'parser': 'table'}]
            result, report = m.run(manifest, {'sources': [old]}, {'www.nowon.kr', 'www.gccity.go.kr'})
            self.assertEqual(result['sources'][0], old)
            self.assertEqual(result['sources'][1]['items'][0]['name'], '새 사업')
            self.assertEqual(report['errors'][0]['source'], old_url)
            self.assertEqual(report['results'][0]['status'], 'added')
        finally:
            f.unlink(missing_ok=True)
            Path(directory).rmdir()

    def test_duplicate_and_invalid_hosts_are_rejected(self):
        manifest = [{'source': 'https://bad.example/a', 'file': 'x', 'parser': 'table'}]
        result, report = m.run(manifest, {'sources': []}, {'www.nowon.kr'})
        self.assertEqual(result['sources'], [])
        self.assertEqual(report['errors'][0]['status'], 'failed')
        with self.assertRaises(ValueError):
            m.run(manifest + copy.deepcopy(manifest), {'sources': []}, {'www.nowon.kr'})


if __name__ == '__main__':
    unittest.main()
