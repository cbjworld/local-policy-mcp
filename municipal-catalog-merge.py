"""Merge extracted municipal snapshots without discarding existing sources on failure."""
import argparse
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse


def read_json(path):
    path = Path(path)
    if path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('자료 크기 제한 초과')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def validate(snapshot, registered):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('source'), str):
        raise ValueError('원문 주소 누락')
    parsed = urlparse(snapshot['source'])
    if parsed.scheme != 'https' or parsed.hostname not in registered or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('등록된 지자체의 HTTPS 주소가 아님')
    if not re.fullmatch(r'[a-f0-9]{64}', snapshot.get('sha256', '')):
        raise ValueError('원문 해시 누락')
    if not isinstance(snapshot.get('items'), list) or not isinstance(snapshot.get('skipped'), list):
        raise ValueError('사업 목록 형식 오류')
    locations = set()
    for item in snapshot['items']:
        loc = item.get('location', {}) if isinstance(item, dict) else {}
        table, row = loc.get('table'), loc.get('row')
        section = loc.get('section')
        element = loc.get('elementId')
        element_class = loc.get('elementClass')
        table_loc = type(table) is int and type(row) is int and table >= 1 and row >= 1 and section is None and element is None and element_class is None
        section_loc = type(section) is int and section >= 1 and table is None and row is None and element is None and element_class is None
        element_loc = element in ('contents', 'conts', 'content', 'body_content') and section is None and table is None and row is None and element_class is None
        class_loc = ((element_class == 'view_cont' and parsed.hostname == 'www.gumi.go.kr' and '/board/post/view.do' in parsed.path) or (element_class == 'board-view-content' and parsed.hostname == 'www.seongnam.go.kr' and re.fullmatch(r'/bbs[0-9]+/[0-9]+', parsed.path)) or (element_class == 'con_wrap' and parsed.hostname == 'www.ansan.go.kr' and parsed.path == '/iloveyou/sub/contents.do') or (element_class == 'tview_desc' and parsed.hostname == 'www.yongin.go.kr' and parsed.path == '/user/bbs/BD_selectBbs.do') or (element_class == 'con' and parsed.hostname == 'www.bsseogu.go.kr' and parsed.path == '/news/board/view.do') or (element_class == 'con' and parsed.hostname == 'www.gyeyang.go.kr' and parsed.path == '/open_content/main/bbs/bbsMsgDetail.do')) and all(x is None for x in (section, table, row, element))
        key = ('table', table, row) if table_loc else ('section', section) if section_loc else ('element', element) if element_loc else ('class', element_class)
        if (not isinstance(item, dict) or item.get('source') != snapshot['source']
                or not isinstance(item.get('name'), str) or not item['name'].strip()
                or not isinstance(item.get('content'), str) or not item['content'].strip()
                or not (table_loc or section_loc or element_loc or class_loc) or key in locations):
            raise ValueError('사업 행 또는 원문 위치 오류')
        locations.add(key)


def merge(base, candidates, registered):
    sources = base.get('sources') if isinstance(base, dict) else None
    if not isinstance(sources, list):
        raise ValueError('기존 자료 형식 오류')
    current = {}
    for source in sources:
        validate(source, registered)
        if source['source'] in current:
            raise ValueError('기존 원문 주소 중복')
        current[source['source']] = source
    report = []
    for name, source in candidates:
        try:
            validate(source, registered)
            key = source['source']
            old = current.get(key)
            comparable = lambda value: {k: v for k, v in value.items() if k != 'extractedAt'}
            if old and comparable(old) == comparable(source):
                status = 'unchanged'
            elif not source['items'] or (old and (len(source['items']) < len(old['items']) or len(source['skipped']) > len(old['skipped']))):
                status = 'review_required'
            else:
                current[key] = source
                status = 'updated' if old else 'added'
            report.append({'input': name, 'source': key, 'status': status, 'rows': len(source['items'])})
        except (ValueError, TypeError) as error:
            report.append({'input': name, 'status': 'invalid', 'reason': str(error)})
    return {'sources': list(current.values())}, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('candidates', nargs='+')
    args = parser.parse_args()
    registry = read_json(Path(__file__).with_name('catalog-institutions.json'))
    hosts = {urlparse(x['url']).hostname for x in registry['records'] if urlparse(x['url']).scheme == 'https'}
    base = read_json(args.base)
    candidates = []
    for path in args.candidates:
        try:
            candidates.append((Path(path).name, read_json(path)))
        except (ValueError, OSError):
            candidates.append((Path(path).name, None))
    result, report = merge(base, candidates, hosts)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=target.parent, delete=False) as out:
        temp = out.name
        try:
            json.dump(result, out, ensure_ascii=False, indent=2)
            out.flush()
            os.fsync(out.fileno())
        except BaseException:
            out.close()
            os.unlink(temp)
            raise
    try:
        os.replace(temp, target)
    except BaseException:
        os.unlink(temp)
        raise
    print(json.dumps({'sources': len(result['sources']), 'report': report}, ensure_ascii=False))


if __name__ == '__main__':
    main()
