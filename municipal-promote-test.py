import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('promote', Path(__file__).with_name('municipal-promote.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def source(url, name):
    return {'source': url, 'sha256': 'a' * 64, 'items': [{'source': url, 'name': name, 'content': '안내 내용', 'location': {'section': 1}}], 'skipped': []}


class PromoteTest(unittest.TestCase):
    def test_addition_preserves_backup_and_rejects_loss(self):
        with tempfile.TemporaryDirectory() as directory:
            current, candidate = Path(directory) / 'current.json', Path(directory) / 'candidate.json'
            old = {'sources': [source('https://www.nowon.kr/old', '기존 사업')]}
            new = {'sources': old['sources'] + [source('https://www.nowon.kr/new', '새 사업')]}
            current.write_text(json.dumps(old, ensure_ascii=False), encoding='utf-8')
            candidate.write_text(json.dumps(new, ensure_ascii=False), encoding='utf-8')
            result = m.promote(current, candidate, {'www.nowon.kr'})
            self.assertEqual(result['addedSources'], 1)
            self.assertEqual(json.loads(current.read_text(encoding='utf-8')), new)
            self.assertEqual(json.loads(Path(result['backup']).read_text(encoding='utf-8')), old)
            before = current.read_bytes()
            candidate.write_text(json.dumps(old), encoding='utf-8')
            with self.assertRaises(ValueError):
                m.promote(current, candidate, {'www.nowon.kr'})
            self.assertEqual(current.read_bytes(), before)
            changed = copy.deepcopy(new)
            changed['sources'][0]['items'][0]['content'] = '임의 변경'
            changed['sources'].append(source('https://www.nowon.kr/third', '다른 사업'))
            candidate.write_text(json.dumps(changed), encoding='utf-8')
            with self.assertRaises(ValueError):
                m.promote(current, candidate, {'www.nowon.kr'})
            self.assertEqual(current.read_bytes(), before)

    def test_failure_preserves_current_and_blocks_temporary_source(self):
        with tempfile.TemporaryDirectory() as directory:
            current, candidate = Path(directory) / 'current.json', Path(directory) / 'candidate.json'
            old = {'sources': [source('https://www.nowon.kr/old', '기존 사업')]}
            current.write_text(json.dumps(old), encoding='utf-8')
            unsafe = {'sources': old['sources'] + [source('https://www.nowon.kr/new?token=secret', '새 사업')]}
            candidate.write_text(json.dumps(unsafe), encoding='utf-8')
            before = current.read_bytes()
            with self.assertRaises(ValueError):
                m.promote(current, candidate, {'www.nowon.kr'})
            self.assertEqual(current.read_bytes(), before)
            empty = {'sources': old['sources'] + [{**source('https://www.nowon.kr/empty', '빈 사업'), 'items': []}]}
            candidate.write_text(json.dumps(empty), encoding='utf-8')
            with self.assertRaises(ValueError):
                m.promote(current, candidate, {'www.nowon.kr'})
            self.assertEqual(current.read_bytes(), before)
            safe = {'sources': old['sources'] + [source('https://www.nowon.kr/new', '새 사업')]}
            candidate.write_text(json.dumps(safe), encoding='utf-8')
            with patch.object(m.os, 'replace', side_effect=OSError('write failed')):
                with self.assertRaises(OSError):
                    m.promote(current, candidate, {'www.nowon.kr'})
            self.assertEqual(current.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
