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
                self.table = {'rows': [], 'nested': False}
            else:
                self.table['nested'] = True
        elif self.depth == 1 and tag == 'tr':
            self.row = []
        elif self.depth == 1 and tag in ('th', 'td') and self.row is not None:
            def span(name):
                raw = attrs.get(name, '1')
                return int(raw) if isinstance(raw, str) and raw.isdigit() and 1 <= int(raw) <= 100 else 0
            self.cell = {'kind': tag, 'scope': attrs.get('scope'), 'colspan': span('colspan'), 'rowspan': span('rowspan'), 'text': [], 'links': []}
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


def expanded_content_rows(rows, width):
    if not 1 <= width <= 100:
        return None
    active = [None] * width
    output = []
    for index, cells in enumerate(rows):
        grid = [entry if entry and entry[1] > index else None for entry in active]
        for cell in cells:
            span, height = cell['colspan'], cell['rowspan']
            if span < 1 or height < 1 or index + height > len(rows):
                return None
            start = next((i for i, entry in enumerate(grid) if entry is None), width)
            if start + span > width or any(grid[i] is not None for i in range(start, start + span)):
                return None
            entry = (cell, index + height)
            for i in range(start, start + span):
                grid[i] = entry
        if any(entry is None for entry in grid):
            return None
        unique = []
        for entry in grid:
            if not unique or unique[-1] is not entry:
                unique.append(entry)
        output.append(' | '.join(entry[0]['text'] for entry in unique))
        active = grid
    return output


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
        name_headers = [h for h in headers if h in ('사업명', '사업명/서비스명')]
        if not name_headers:
            continue
        if len(name_headers) != 1:
            skipped.append({'table': table_no, 'reason': 'unrecognized_name_header'})
            continue
        name_header = name_headers[0]
        content_headers = [h for h in headers if h in ('사업내용', '사업내용/지원내용') or h.startswith('사업내용(')]
        if not content_headers and '지원내용' in headers:
            content_headers = ['지원내용']
        if len(content_headers) != 1:
            skipped.append({'table': table_no, 'reason': 'unrecognized_content_header'})
            continue
        content_header = content_headers[0]
        if table['nested'] or len(set(headers)) != len(headers) or any(c['rowspan'] != 1 or c['colspan'] == 0 for c in rows[0]):
            skipped.append({'table': table_no, 'reason': 'nested_or_irregular_headers'})
            continue
        widths = [c['colspan'] for c in rows[0]]
        remaining = 0
        processed_through = 0
        for row_no, row in enumerate(rows[1:], 2):
            if row_no <= processed_through:
                continue
            if len(row) > 1 and all(c['kind'] == 'th' for c in row) and not remaining:
                replacement = [re.sub(r'\s+', '', c['text']) for c in row]
                name_candidates = [h for h in replacement if h in ('사업명', '사업명/서비스명')]
                candidates = [h for h in replacement if h in ('사업내용', '사업내용/지원내용') or h.startswith('사업내용(')]
                if not candidates and '지원내용' in replacement:
                    candidates = ['지원내용']
                if (len(name_candidates) == 1 and len(candidates) == 1 and len(set(replacement)) == len(replacement)
                        and all(c['rowspan'] == 1 and c['colspan'] > 0 for c in row)):
                    headers, widths, name_header, content_header = replacement, [c['colspan'] for c in row], name_candidates[0], candidates[0]
                else:
                    headers, widths, content_header = [], [], None
                    skipped.append({'table': table_no, 'row': row_no, 'reason': 'unrecognized_repeated_header'})
                continue
            if content_header is None:
                skipped.append({'table': table_no, 'row': row_no, 'reason': 'unrecognized_repeated_header'})
                continue
            # Only combine a fully bounded program block with an explicit shared name and contact.
            if (not remaining and len(headers) == 3 and headers[0] == name_header and headers[1] == content_header
                    and len(row) == 3 and row[0]['text'] and row[1]['text'] and row[0]['rowspan'] > 1
                    and row[0]['colspan'] == widths[0] == 1 and row[1]['rowspan'] == 1
                    and row[1]['colspan'] == widths[1] and row[2]['rowspan'] == row[0]['rowspan']
                    and row[2]['colspan'] == widths[2] == 1):
                count = row[0]['rowspan']
                following = rows[row_no:row_no + count - 1]
                content_rows = expanded_content_rows([[row[1]]] + following, widths[1]) if len(following) == count - 1 else None
                if content_rows is not None:
                    content = '\n'.join(content_rows)
                    fields = {headers[0]: row[0]['text'], headers[1]: content, headers[2]: row[2]['text']}
                    results.append({'name': fields[name_header], 'nameColumn': name_header,
                                    'content': content, 'contentColumn': content_header,
                                    'department': fields.get('담당부서'), 'fields': fields,
                                    'links': list(dict.fromkeys(link for cells in [row] + following for cell in cells for link in cell['links'])),
                                    'source': source, 'location': {'table': table_no, 'row': row_no, 'rowEnd': row_no + count - 1},
                                    'status': 'source_row_candidate'})
                    processed_through = row_no + count - 1
                    continue
            # A category in the first column may cover several independent rows;
            # the name and content cells must each be present in every row.
            if (not remaining and headers[0] in ('분야', '구분') and widths == [1] * len(headers)
                    and len(row) == len(headers) and row[0]['rowspan'] > 1 and row[0]['colspan'] == 1
                    and row[0]['text'] and all(c['rowspan'] == 1 and c['colspan'] == 1 for c in row[1:])):
                count = row[0]['rowspan']
                following = rows[row_no:row_no + count - 1]
                group = [row[1:]] + following
                if (len(following) == count - 1 and all(len(r) == len(headers) - 1 and
                        all(c['kind'] == 'td' and c['rowspan'] == 1 and c['colspan'] == 1 for c in r) for r in group)):
                    prepared = []
                    for index, cells in enumerate(group):
                        fields = dict(zip(headers, [row[0]['text']] + [c['text'] for c in cells]))
                        if not fields[name_header] or not fields[content_header]:
                            break
                        prepared.append({'name': fields[name_header], 'nameColumn': name_header,
                                         'content': fields[content_header], 'contentColumn': content_header,
                                         'department': fields.get('담당부서'), 'fields': fields,
                                         'links': list(dict.fromkeys(link for cell in [row[0]] + cells for link in cell['links'])),
                                         'source': source, 'location': {'table': table_no, 'row': row_no + index},
                                         'status': 'source_row_candidate'})
                    if len(prepared) == count:
                        results.extend(prepared)
                        processed_through = row_no + count - 1
                        continue
            if remaining or any(c['rowspan'] != 1 for c in row):
                remaining = max(remaining - 1, max((c['rowspan'] - 1 for c in row), default=0))
                skipped.append({'table': table_no, 'row': row_no, 'reason': 'rowspan'})
                continue
            if len(row) != len(headers) or [c['colspan'] for c in row] != widths or not all(c['kind'] == 'td' or (c['kind'] == 'th' and (c['scope'] == 'row' or (c['scope'] is None and headers[index] == name_header))) for index, c in enumerate(row)):
                skipped.append({'table': table_no, 'row': row_no, 'reason': 'irregular_row'})
                continue
            fields = dict(zip(headers, (c['text'] for c in row)))
            if not fields[name_header] or not fields[content_header]:
                continue
            results.append({'name': fields[name_header], 'nameColumn': name_header, 'content': fields[content_header], 'contentColumn': content_header,
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
