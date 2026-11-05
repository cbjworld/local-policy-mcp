"""Extract candidate policy rows from explicit municipal website tables."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, urljoin


def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


class Tables(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.tables, self.table, self.row, self.cell = [], None, None, None
        self.depth = 0
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
        if self.skip:
            return
        if tag == 'table':
            self.depth += 1
            if self.depth == 1:
                self.table = {'rows': [], 'merged': False}
            else:
                self.table['merged'] = True
        elif self.depth == 1 and tag == 'tr':
            self.row = []
        elif self.depth == 1 and tag in ('th', 'td') and self.row is not None:
            self.cell = {'kind': tag, 'scope': attrs.get('scope'), 'text': [], 'links': []}
            if attrs.get('rowspan', '1') != '1' or attrs.get('colspan', '1') != '1':
                self.table['merged'] = True
        elif self.cell is not None and tag in ('br', 'p', 'div', 'li'):
            self.cell['text'].append(' ')
        elif self.cell is not None and tag == 'a' and attrs.get('href'):
            url = urljoin(self.source, attrs['href'])
            parsed = urlparse(url)
            if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
                self.cell['links'].append(url)

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if self.depth == 1 and tag in ('th', 'td') and self.cell is not None:
            self.cell['text'] = clean(''.join(self.cell['text']))
            self.row.append(self.cell)
            self.cell = None
        elif self.depth == 1 and tag == 'tr' and self.row is not None:
            self.table['rows'].append(self.row)
            self.row = None
        elif tag == 'table' and self.depth:
            self.depth -= 1
            if self.depth == 0:
                self.tables.append(self.table)
                self.table = None

    def handle_data(self, data):
        if not self.skip and self.cell is not None:
            self.cell['text'].append(data)


def extract(data, source):
    u = urlparse(source)
    if u.scheme != 'https' or not u.hostname or u.username:
        raise ValueError('HTTPS 원문 주소가 필요합니다')
    parser = Tables(source)
    parser.feed(data.decode('utf-8-sig'))
    results, skipped = [], []
    for table_no, table in enumerate(parser.tables, 1):
        rows = table['rows']
        if not rows:
            continue
        headers = [re.sub(r'\s+', '', x['text']) for x in rows[0]]
        if '사업명' not in headers or '사업내용' not in headers:
            continue
        if table['merged'] or len(set(headers)) != len(headers):
            skipped.append({'table': table_no, 'reason': 'merged_or_duplicate_headers'})
            continue
        for row_no, row in enumerate(rows[1:], 2):
            if len(row) != len(headers) or not all(c['kind'] == 'td' or (c['kind'] == 'th' and c['scope'] == 'row') for c in row):
                skipped.append({'table': table_no, 'row': row_no, 'reason': 'irregular_row'})
                continue
            fields = dict(zip(headers, (c['text'] for c in row)))
            if not fields['사업명'] or not fields['사업내용']:
                continue
            results.append({'name': fields['사업명'], 'content': fields['사업내용'],
                            'department': fields.get('담당부서'), 'fields': fields,
                            'links': list(dict.fromkeys(link for cell in row for link in cell['links'])), 'source': source,
                            'location': {'table': table_no, 'row': row_no},
                            'status': 'source_row_candidate'})
    return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'extractedAt': datetime.now(timezone.utc).isoformat(),
            'tables': len(parser.tables), 'items': results, 'skipped': skipped}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('source')
    ap.add_argument('--output', required=True)
    args = ap.parse_args()
    result = extract(Path(args.file).read_bytes(), args.source)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'items': len(result['items']), 'skipped': len(result['skipped'])}, ensure_ascii=False))
