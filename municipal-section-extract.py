"""Extract explicit heading-and-details policy sections from municipal HTML."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


class Sections(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source, self.depth, self.container = source, 0, None
        self.heading, self.heading_depth, self.body_depth = None, None, None
        self.text, self.links, self.items, self.skipped = [], [], [], []
        self.serial, self.skip = 0, 0

    def handle_starttag(self, tag, attrs):
        if tag in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            if tag == 'br' and self.body_depth is not None and not self.skip:
                self.text.append(' ')
            return
        attrs = dict(attrs)
        self.depth += 1
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
        if self.skip:
            return
        classes = (attrs.get('class') or '').split()
        if tag == 'div' and self.container is None and 'spotWrap' in classes:
            self.container = self.depth
        elif self.container is not None and self.depth == self.container + 1 and tag == 'h4':
            if self.heading:
                self.skipped.append({'section': self.serial, 'reason': 'missing_details'})
            self.serial += 1
            self.heading, self.heading_depth = [], self.depth
        elif self.container is not None and self.depth == self.container + 1 and tag == 'div' and 'div' in classes and self.heading is not None:
            self.body_depth, self.text, self.links = self.depth, [], []
        elif self.body_depth is not None:
            if tag in ('p', 'div', 'br', 'li'):
                self.text.append(' ')
            if tag == 'a' and attrs.get('href'):
                url = urljoin(self.source, attrs['href'])
                p = urlparse(url)
                if p.scheme == 'https' and p.hostname and not p.username and not p.password:
                    self.links.append(url)

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip = max(0, self.skip - 1)
        elif not self.skip:
            if tag == 'h4' and self.depth == self.heading_depth:
                self.heading_depth = None
            elif tag == 'div' and self.depth == self.body_depth:
                name, content = clean(''.join(self.heading)), clean(''.join(self.text))
                if name and re.search(r'(?:지원|사업)대상', content) and re.search(r'(?:지원|사업)내용', content):
                    self.items.append({'name': name, 'content': content, 'contentColumn': '사업별 안내', 'department': None,
                                       'fields': {}, 'links': list(dict.fromkeys(self.links)), 'source': self.source,
                                       'location': {'section': self.serial}, 'status': 'source_section_candidate'})
                else:
                    self.skipped.append({'section': self.serial, 'reason': 'missing_policy_labels'})
                self.heading, self.body_depth = None, None
            elif tag == 'div' and self.depth == self.container:
                if self.heading:
                    self.skipped.append({'section': self.serial, 'reason': 'missing_details'})
                self.heading, self.container = None, None
        self.depth -= 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.handle_endtag(tag)

    def handle_data(self, data):
        if self.skip:
            return
        if self.heading_depth is not None:
            self.heading.append(data)
        elif self.body_depth is not None:
            self.text.append(data)


def extract(data, source):
    u = urlparse(source)
    if u.scheme != 'https' or not u.hostname or u.username:
        raise ValueError('HTTPS 원문 주소가 필요합니다')
    parser = Sections(source)
    parser.feed(data.decode('utf-8-sig'))
    return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'extractedAt': datetime.now(timezone.utc).isoformat(),
            'items': parser.items, 'skipped': parser.skipped}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('file')
    p.add_argument('source')
    p.add_argument('--output', required=True)
    args = p.parse_args()
    result = extract(Path(args.file).read_bytes(), args.source)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'items': len(result['items']), 'skipped': len(result['skipped'])}, ensure_ascii=False))
