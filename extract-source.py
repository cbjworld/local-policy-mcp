import sys, json, io, re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

class Page(HTMLParser):
    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base, self.parts, self.links = base, [], []
        self.skip = 0
        self.anchor = None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script','style','noscript'): self.skip += 1
        if self.skip: return
        if tag in ('p','div','br','li','tr','h1','h2','h3','section'): self.parts.append('\n')
        if tag == 'a' and attrs.get('href'):
            self.anchor = [urljoin(self.base,attrs['href']),[]]
    def handle_endtag(self, tag):
        if tag in ('script','style','noscript'):
            self.skip = max(0,self.skip-1)
        if tag == 'a' and self.anchor:
            url, parts = self.anchor
            p = urlparse(url)
            if p.scheme == 'https' and ((p.hostname or '').endswith('.go.kr') or p.hostname in ('gov.kr','www.gov.kr')) and not p.username:
                self.links.append({'url':url,'title':' '.join(parts).strip()[:200]})
            self.anchor = None
    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)
            if self.anchor: self.anchor[1].append(data)

def clean(text): return re.sub(r'\s+',' ',text).strip()
def main():
    opts=json.loads(sys.argv[1]); data=sys.stdin.buffer.read(15*1024*1024+1)
    if len(data)>15*1024*1024: raise ValueError('Document too large')
    words=opts.get('q','').split(); start=opts.get('page',1); pages=[]; links=[]
    if data.startswith(b'%PDF-'):
        import os
        result = None
        fast_failed = False
        if os.environ.get('POLICY_PDF_ENGINE') == 'poppler' and not words:
            try:
                from pdf_fast import extract
                result = extract(data, start, scan_empty=opts.get('scanEmptyPdf') is True)
            except Exception:
                fast_failed = True
        if result is None:
            from pypdf import PdfReader
            reader=PdfReader(io.BytesIO(data),strict=False)
            if reader.is_encrypted and not reader.decrypt(''): raise ValueError('PDF requires a password')
            total=len(reader.pages)
            if start>total: raise ValueError('Page outside document')
            # Bound work; query scans up to 300 PDF pages, returns at most six matching pages.
            stop=min(total, start+299 if words else start+5)
            for i in range(start-1,stop):
                text=clean(reader.pages[i].extract_text() or '')
                if not words or all(w.casefold() in text.casefold() for w in words):
                    pages.append({'page':i+1,'text':text[:14000],'truncated':len(text)>14000})
                    if len(pages)==6: break
            scanned=i+1
            result={'format':'pdf','totalPages':total,'scannedThroughPage':scanned,'scanComplete':scanned==total,'pages':pages,'links':[], 'warning':'PDF 첫 장을 1쪽으로 센 번호입니다. 표의 단위·행·열은 원본에서 확인하세요. 이미지 PDF의 OCR은 미지원입니다.'}
            if fast_failed: result['parserFallback'] = 'poppler_failed'
    else:
        content_type=opts.get('type','')
        if not ('text/' in content_type or data.lstrip().lower().startswith((b'<!doctype html',b'<html'))): raise ValueError('Only HTML, text and PDF supported')
        charset=re.search(r'charset\s*=\s*[\"\x27]?([^;\s\"\x27]+)',content_type,re.I)
        if not charset: charset=re.search(rb'charset\s*=\s*[\"\x27]?([\w-]+)',data[:8192],re.I)
        encoding=charset[1] if charset else 'utf-8'
        if isinstance(encoding,bytes): encoding=encoding.decode('ascii')
        raw=data.decode(encoding,errors='replace'); parser=Page(opts['url']); parser.feed(raw)
        text=clean(' '.join(parser.parts))
        if words:
            positions=[m.start() for w in words for m in re.finditer(re.escape(w),text,re.I)]
            if positions:
                windows=[]; end=-1
                for pos in sorted(set(positions)):
                    left=max(0,pos-450); right=min(len(text),pos+1500)
                    if left>end: windows.append(text[left:right]); end=right
                    if sum(map(len,windows))>=20000: break
                excerpt='\n[…]\n'.join(windows)
            else: excerpt=''
        else: excerpt=text[:20000]
        seen=set()
        for link in parser.links:
            if link['url'] not in seen:
                seen.add(link['url']);links.append(link)
        links.sort(key=lambda x:not bool(re.search(r'pdf|hwp|다운로드|첨부|download',x['url']+' '+x['title'],re.I)))
        result={'format':'html','pages':[{'page':None,'text':excerpt[:20000],'truncated':excerpt!=text}],'links':links[:60],'warning':'HTML 본문에 메뉴가 포함될 수 있습니다. 검색어 주변 발췌는 전체 문서가 아닙니다.'}
    sys.stdout.write(json.dumps(result,ensure_ascii=True))

try: main()
except ModuleNotFoundError as error:
    sys.stderr.write('MISSING_PYPDF' if error.name == 'pypdf' else 'Document extraction dependency missing.');sys.exit(1)
except Exception:
    sys.stderr.write('Document extraction failed: unsupported, corrupt, encrypted or out-of-range document.');sys.exit(1)
