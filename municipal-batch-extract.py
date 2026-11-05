"""Batch local municipal HTML extraction and preserve previous successful snapshots."""
import argparse
import importlib.util
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


merger = load_module('catalog_merger', 'municipal-catalog-merge.py')
extractors = {'table': load_module('tables', 'municipal-table-extract.py'),
              'section': load_module('sections', 'municipal-section-extract.py'),
              'detail': load_module('detail', 'municipal-detail-extract.py')}


def run(manifest, base, hosts, max_bytes=15 * 1024 * 1024):
    if not isinstance(manifest, list) or not manifest or len(manifest) > 500:
        raise ValueError('수집 목록은 1~500개여야 합니다.')
    sources = set()
    for item in manifest:
        if (not isinstance(item, dict) or set(item) != ({'source', 'file', 'parser', 'title'} if item.get('parser') == 'detail' else {'source', 'file', 'parser'})
                or not all(isinstance(item[k], str) for k in item) or (item.get('parser') == 'detail' and (not item['title'].strip() or len(item['title']) > 200))):
            raise ValueError('수집 목록 형식을 확인하세요.')
        if item['source'] in sources or item['parser'] not in extractors:
            raise ValueError('원문 주소 중복 또는 지원하지 않는 형식입니다.')
        sources.add(item['source'])
    candidates, errors = [], []
    for item in manifest:
        try:
            parsed = urlparse(item['source'])
            if parsed.scheme != 'https' or parsed.hostname not in hosts or parsed.username or parsed.password or parsed.port not in (None, 443):
                raise ValueError('등록된 지자체 HTTPS 주소가 아닙니다.')
            file = Path(item['file'])
            if file.stat().st_size > max_bytes:
                raise ValueError('원문 크기 제한 초과')
            extractor = extractors[item['parser']]
            snapshot = extractor.extract(file.read_bytes(), item['source'], item['title']) if item['parser'] == 'detail' else extractor.extract(file.read_bytes(), item['source'])
            candidates.append((file.name, snapshot))
        except (OSError, ValueError, UnicodeError) as error:
            errors.append({'source': item['source'], 'status': 'failed', 'reason': type(error).__name__})
    merged, results = merger.merge(base, candidates, hosts)
    return merged, {'attempted': len(manifest), 'parsed': len(candidates), 'errors': errors, 'results': results}


def write_atomic(path, value):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=target.parent, delete=False) as out:
        name = out.name
        try:
            json.dump(value, out, ensure_ascii=False, indent=2)
            out.flush()
            os.fsync(out.fileno())
        except BaseException:
            out.close()
            os.unlink(name)
            raise
    try:
        os.replace(name, target)
    except BaseException:
        os.unlink(name)
        raise


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True)
    p.add_argument('--base', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--report', required=True)
    args = p.parse_args()
    if Path(args.output).resolve() == Path(args.report).resolve():
        raise ValueError('자료 파일과 보고서 파일은 달라야 합니다.')
    manifest = merger.read_json(args.manifest)
    protected = {Path(args.manifest).resolve()}
    if isinstance(manifest, list):
        protected.update(Path(item['file']).resolve() for item in manifest if isinstance(item, dict) and isinstance(item.get('file'), str))
    if Path(args.output).resolve() in protected or Path(args.report).resolve() in protected or Path(args.report).resolve() == Path(args.base).resolve():
        raise ValueError('원문·목록·기존 자료를 보고서로 덮어쓸 수 없습니다.')
    registry = merger.read_json(Path(__file__).with_name('catalog-institutions.json'))
    hosts = {urlparse(x['url']).hostname for x in registry['records'] if urlparse(x['url']).scheme == 'https'}
    merged, report = run(manifest, merger.read_json(args.base), hosts)
    write_atomic(args.output, merged)
    write_atomic(args.report, report)
    print(json.dumps({'sources': len(merged['sources']), 'attempted': report['attempted'], 'failed': len(report['errors']),
                      'review': sum(r['status'] in ('invalid', 'review_required') for r in report['results'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
