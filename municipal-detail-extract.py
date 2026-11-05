"""Extract a single explicitly identified municipal policy information page."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

VOID = frozenset(('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'))


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source, self.content_depth = source, 0
        self.title_active, self.skip, self.blocks = False, 0, 0
        self.title, self.parts, self.links = [], [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in VOID:
            if tag == 'br' and self.content_depth and not self.skip:
                self.parts.append(' ')
            return
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
        if self.skip:
            return
        if tag == 'title':
            self.title_active = True
        if tag == 'div' and attrs.get('id') == 'contents':
            self.blocks += 1
            if self.blocks == 1:
                self.content_depth = 1
        elif tag == 'div' and self.content_depth:
            self.content_depth += 1
        if self.content_depth:
            if tag in ('li', 'p', 'div', 'h2', 'h3', 'h4', 'tr'):
                self.parts.append(' ')
            if tag == 'a' and attrs.get('href'):
                url = urljoin(self.source, attrs['href'])
                parsed = urlparse(url)
                if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
                    self.links.append(url)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in ('script', 'style', 'noscript'):
            self.skip = max(0, self.skip - 1)
        elif not self.skip:
            if tag == 'title':
                self.title_active = False
            if tag == 'div' and self.content_depth:
                self.content_depth -= 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.skip:
            return
        if self.title_active:
            self.title.append(data)
        if self.content_depth:
            self.parts.append(data)


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


def extract(data, source, expected_title):
    u = urlparse(source)
    if u.scheme != 'https' or not u.hostname or u.username or not expected_title or len(expected_title) > 200:
        raise ValueError('원문 주소 또는 사업 제목 오류')
    page = Page(source)
    page.feed(data.decode('utf-8-sig'))
    title, content = clean(''.join(page.title)), clean(''.join(page.parts))
    normalize = lambda x: re.sub(r'\s+', '', x)
    if (page.blocks != 1 or normalize(expected_title) not in normalize(title)
            or len(content) < 40 or len(content) > 30000
            or not re.search(r'(?:지원|신청)대상|대상', content)
            or not re.search(r'(?:지원|사업)내용', content)):
        return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'items': [],
                'skipped': [{'elementId': 'contents', 'reason': 'detail_page_unverified'}]}
    return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'extractedAt': datetime.now(timezone.utc).isoformat(),
            'items': [{'name': expected_title, 'content': content, 'contentColumn': '사업 안내 본문', 'department': None,
                       'fields': {}, 'links': list(dict.fromkeys(page.links)), 'source': source,
                       'location': {'elementId': 'contents'}, 'status': 'source_detail_candidate'}], 'skipped': []}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('file')
    p.add_argument('source')
    p.add_argument('title')
    p.add_argument('--output', required=True)
    args = p.parse_args()
    result = extract(Path(args.file).read_bytes(), args.source, args.title)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'items': len(result['items']), 'skipped': len(result['skipped'])}, ensure_ascii=False))
