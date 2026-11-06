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
    def __init__(self, source, element_id='contents', element_class=None):
        super().__init__(convert_charrefs=True)
        self.source, self.content_depth, self.element_id, self.element_class = source, 0, element_id, element_class
        self.title_active, self.skip, self.blocks = False, 0, 0
        self.title, self.parts, self.links = [], [], []
        self.headings, self.heading = [], None

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
        if tag == 'h1':
            self.heading = []
        if tag == 'div' and ((self.element_id and attrs.get('id') == self.element_id) or (self.element_class and self.element_class in attrs.get('class', '').split())):
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
            if tag == 'h1' and self.heading is not None:
                self.headings.append(clean(''.join(self.heading)))
                self.heading = None
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
        if self.heading is not None:
            self.heading.append(data)
        if self.content_depth:
            self.parts.append(data)


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


class GumiNotice(HTMLParser):
    def __init__(self, classes=('subject', 'view_date', 'view_cont')):
        super().__init__(convert_charrefs=True)
        self.classes = classes
        self.depth = 0
        self.skip = 0
        self.active = None
        self.container_tag = None
        self.counts = dict.fromkeys(classes, 0)
        self.values = {key: [] for key in self.counts}

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
            return
        if self.skip:
            return
        if tag in VOID:
            if tag == 'br' and self.active:
                self.values[self.active].append(' ')
            return
        attrs = dict(attrs)
        classes = attrs.get('class', '').split()
        key = next((x for x in self.counts if x in classes or x == attrs.get('id')), None)
        if self.active:
            if tag == self.container_tag:
                self.depth += 1
            if tag in ('p', 'li', 'div', 'tr'):
                self.values[self.active].append(' ')
        elif key:
            self.counts[key] += 1
            self.active, self.depth, self.container_tag = key, 1, tag

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in VOID or not self.active or tag != self.container_tag:
            return
        self.depth -= 1
        if self.depth == 0:
            self.active = None

    def handle_data(self, data):
        if self.active and not self.skip:
            self.values[self.active].append(data)


class YonginNotice(GumiNotice):
    def __init__(self):
        super().__init__(('title', 'activeTr', 'tview_desc'))
        self.scope_depth = 0
        self.scope_count = 0

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'div':
            if self.scope_depth:
                self.scope_depth += 1
            elif 't_view' in attributes.get('class', '').split():
                self.scope_count += 1
                self.scope_depth = 1
        if self.scope_depth:
            super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if self.scope_depth:
            super().handle_endtag(tag)
            if tag == 'div':
                self.scope_depth -= 1


class GyeyangNotice(GumiNotice):
    def __init__(self):
        super().__init__(('notice-title', 'data', 'con'))
        self.scope_depth = 0
        self.scope_count = 0
        self.header = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = attributes.get('class', '').split()
        if tag == 'div':
            if self.scope_depth:
                self.scope_depth += 1
            elif 'general_board' in classes and 'board_view' in classes:
                self.scope_count += 1
                self.scope_depth = 1
            if self.scope_depth == 2 and 'tit' in classes and not self.counts['notice-title']:
                self.header = True
        if self.scope_depth:
            if tag == 'p' and self.header and not self.counts['notice-title']:
                attrs = list(attrs) + [('class', 'notice-title')]
            super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if self.scope_depth:
            super().handle_endtag(tag)
            if tag == 'div':
                if self.scope_depth == 2:
                    self.header = False
                self.scope_depth -= 1


class BusanSeoguNotice(GumiNotice):
    def __init__(self):
        super().__init__(('notice-title', 'info', 'con'))
        self.scope_depth = 0
        self.scope_count = 0

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'div':
            if self.scope_depth:
                self.scope_depth += 1
            elif 'board-view-wrap' in attributes.get('class', '').split():
                self.scope_count += 1
                self.scope_depth = 1
        if self.scope_depth:
            if tag == 'h4':
                attrs = list(attrs) + [('class', 'notice-title')]
            super().handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if self.scope_depth:
            super().handle_endtag(tag)
            if tag == 'div':
                self.scope_depth -= 1


def gumi_notice(data, source, expected_title):
    html = data.decode('utf-8-sig')
    host = urlparse(source).hostname
    classes = ('board-view-head', 'board-view-table', 'board-view-content') if host == 'www.seongnam.go.kr' else ('title', 'activeTr', 'tview_desc') if host == 'www.yongin.go.kr' else ('notice-title', 'info', 'con') if host == 'www.bsseogu.go.kr' else ('notice-title', 'data', 'con') if host == 'www.gyeyang.go.kr' else ('subject', 'view_date', 'view_cont')
    page = YonginNotice() if host == 'www.yongin.go.kr' else BusanSeoguNotice() if host == 'www.bsseogu.go.kr' else GyeyangNotice() if host == 'www.gyeyang.go.kr' else GumiNotice(classes)
    page.feed(html)
    subject, date, content = (clean(''.join(page.values[x])) for x in classes)
    norm = lambda x: re.sub(r'[\s「」『』]', '', x)
    dates = re.findall(r'20\d{2}-\d{2}-\d{2}', date)
    date_match = dates[0] if len(dates) == 1 and ('등록일' in date or host == 'www.bsseogu.go.kr') else None
    marked = re.search(r'공공누리.{0,30}제\s*1\s*유형', html, re.I | re.S)
    if host == 'www.gyeyang.go.kr':
        korean_dates = re.findall(r'작성일\s*(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일', date)
        date_match = '%s-%02d-%02d' % (korean_dates[0][0], int(korean_dates[0][1]), int(korean_dates[0][2])) if len(korean_dates) == 1 else None
        if date_match:
            try:
                datetime.strptime(date_match, '%Y-%m-%d')
            except ValueError:
                date_match = None
        marked = re.search(r'<p\s+class="openNuri"[^>]*>\s*<img[^>]*alt="공공누리[^\"]*제\s*1\s*유형', html, re.I | re.S)
    policy = re.search(r'(?:지원|신청)대상|지원자격', content) and re.search(r'(?:지원|사업)(?:내용|금액|규모|한도)', content)
    if host in ('www.yongin.go.kr', 'www.bsseogu.go.kr') and re.search(r'지원\s*대상(?:은|이|자|:|\s)', content) and re.search(r'(?:최대|한도).{0,30}\d[\d,]*(?:만\s*원|원)', content):
        policy = True
    if host == 'www.gyeyang.go.kr' and re.search(r'대\s*상\s*:', content) and re.search(r'내\s*용\s*:', content) and re.search(r'최대\s*\d[\d,]*\s*만\s*원', content):
        policy = True
    notice = re.search(r'마감|종료', subject) and re.search(r'마감|종료', content) and re.search(r'20\d{2}', content)
    if (host in ('www.yongin.go.kr', 'www.bsseogu.go.kr', 'www.gyeyang.go.kr') and page.scope_count != 1) or page.counts[classes[0]] != 1 or page.counts[classes[2]] != 1 or page.counts[classes[1]] < 1 or norm(expected_title) not in norm(subject) or not date_match or not marked or not (40 <= len(content) <= 30000) or not (policy or notice):
        return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'items': [], 'skipped': [{'reason': 'notice_page_unverified'}]}
    return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'extractedAt': datetime.now(timezone.utc).isoformat(),
            'items': [{'name': subject, 'content': '등록일: ' + date_match + ' ' + content, 'contentColumn': '게시글 본문',
                       'department': None, 'fields': {'등록일': date_match}, 'links': [], 'source': source,
                       'location': {'elementClass': classes[2]}, 'status': 'source_notice_candidate'}], 'skipped': []}


def extract(data, source, expected_title):
    u = urlparse(source)
    if u.scheme != 'https' or not u.hostname or u.username or not expected_title or len(expected_title) > 200:
        raise ValueError('원문 주소 또는 사업 제목 오류')
    if (u.hostname == 'www.gumi.go.kr' and '/board/post/view.do' in u.path) or (u.hostname == 'www.seongnam.go.kr' and re.fullmatch(r'/bbs[0-9]+/[0-9]+', u.path)) or (u.hostname == 'www.yongin.go.kr' and u.path == '/user/bbs/BD_selectBbs.do') or (u.hostname == 'www.bsseogu.go.kr' and u.path == '/news/board/view.do') or (u.hostname == 'www.gyeyang.go.kr' and u.path == '/open_content/main/bbs/bbsMsgDetail.do'):
        return gumi_notice(data, source, expected_title)
    html = data.decode('utf-8-sig')
    page = None
    ansan = u.hostname == 'www.ansan.go.kr' and u.path == '/iloveyou/sub/contents.do'
    if ansan:
        candidate = Page(source, element_id=None, element_class='con_wrap')
        candidate.feed(html)
        if candidate.blocks and re.search(r'공공누리.{0,30}제\s*1\s*유형', html, re.I | re.S):
            page = candidate
    for element_id in (() if ansan else ('contents', 'conts', 'content', 'body_content')):
        candidate = Page(source, element_id)
        candidate.feed(html)
        if candidate.blocks:
            page = candidate
            break
    if page is None:
        return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'items': [],
                'skipped': [{'reason': 'detail_page_unverified'}]}
    title, content = clean(''.join(page.title)), clean(''.join(page.parts))
    normalize = lambda x: re.sub(r'\s+', '', x)
    matched_heading = sum(normalize(h) == normalize(expected_title) for h in page.headings) == 1
    if (page.blocks != 1 or (normalize(expected_title) not in normalize(title) and not matched_heading)
            or len(content) < 40 or len(content) > 30000
            or not re.search(r'(?:지원|신청)대상|지원자격|대상|이용아동|이용자격', content)
            or not re.search(r'(?:지원|사업)(?:내용|금액|규모|한도|분야|범위)|이자지원금리', content)):
        return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'items': [],
                'skipped': [{'elementId': page.element_id, 'reason': 'detail_page_unverified'}]}
    return {'source': source, 'sha256': hashlib.sha256(data).hexdigest(), 'extractedAt': datetime.now(timezone.utc).isoformat(),
            'items': [{'name': expected_title, 'content': content, 'contentColumn': '사업 안내 본문', 'department': None,
                       'fields': {}, 'links': list(dict.fromkeys(page.links)), 'source': source,
                       'location': {'elementClass': page.element_class} if page.element_class else {'elementId': page.element_id}, 'status': 'source_detail_candidate'}], 'skipped': []}


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
