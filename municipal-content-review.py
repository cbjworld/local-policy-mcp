"""Compare staged pages with saved program data without changing either source."""
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('batch', Path(__file__).with_name('municipal-batch-extract.py'))
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)
FIELDS = ('name', 'content', 'fields', 'links', 'department', 'location', 'contentColumn')

def compare(old, new):
    def rows(snapshot):
        result = {}
        for item in snapshot['items']:
            key = json.dumps(item['location'], sort_keys=True, ensure_ascii=False)
            if key in result:
                raise ValueError('원문 위치 중복')
            result[key] = {field: item.get(field) for field in FIELDS}
        return result
    if old['source'] != new['source'] or not new.get('items'):
        raise ValueError('동일한 원문과 사업 항목이 필요합니다.')
    previous, current = rows(old), rows(new)
    changed = [{'location': current[k]['location'], 'fields': [f for f in FIELDS if previous[k][f] != current[k][f]]}
               for k in sorted(previous.keys() & current.keys()) if previous[k] != current[k]]
    added = [current[k]['location'] for k in sorted(current.keys() - previous.keys())]
    removed = [previous[k]['location'] for k in sorted(previous.keys() - current.keys())]
    skipped_changed = old.get('skipped') != new.get('skipped')
    return {'source': old['source'], 'oldCount': len(previous), 'newCount': len(current),
            'status': 'content_changed' if changed or added or removed or skipped_changed else 'content_unchanged',
            'changed': changed, 'added': added, 'removed': removed, 'skippedChanged': skipped_changed,
            'note': '추출 가능한 사업 항목만 비교한 결과이며, 원문 반영과 이용 조건 검토는 별도입니다.'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    base = batch.merger.read_json(args.base)
    manifest = batch.merger.read_json(args.manifest)
    report = Path(args.report).resolve()
    protected = {Path(args.base).resolve(), Path(args.manifest).resolve()}
    protected.update(Path(item['file']).resolve() for item in manifest if isinstance(item, dict) and isinstance(item.get('file'), str))
    if report in protected:
        raise ValueError('기존 자료와 원문을 보고서로 덮어쓸 수 없습니다.')
    registry = batch.merger.read_json(Path(__file__).with_name('catalog-institutions.json'))
    hosts = {batch.urlparse(x['url']).hostname for x in registry['records'] if batch.urlparse(x['url']).scheme == 'https'}
    candidate, extraction = batch.run(manifest, base, hosts)
    old = {x['source']: x for x in base['sources']}
    new = {x['source']: x for x in candidate['sources']}
    results = []
    for result in extraction['results']:
        url = result.get('source')
        if result['status'] in ('updated', 'unchanged') and url in old:
            results.append(compare(old[url], new[url]))
        else:
            results.append({'source': url, 'status': 'review_required', 'reason': result['status']})
    results.extend({'source': e['source'], 'status': 'failed', 'reason': e['reason']} for e in extraction['errors'])
    batch.write_atomic(report, {'results': results})
    print(json.dumps({'checked': len(results), 'counts': {status: sum(r['status'] == status for r in results) for status in ('content_unchanged', 'content_changed', 'review_required', 'failed')}}, ensure_ascii=False))

if __name__ == '__main__':
    main()
