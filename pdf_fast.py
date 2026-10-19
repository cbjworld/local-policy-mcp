"""Bounded, text-only Poppler extraction; no OCR or network access."""
import subprocess, re, os

def extract(data, start):
    env = dict(os.environ, LC_ALL='C')
    def run(args):
        p = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20, env=env)
        if p.returncode or len(p.stdout) > 1500000:
            raise ValueError('PDF extraction failed or output limit exceeded')
        return p.stdout.decode('utf-8', errors='replace')
    metadata = run(['pdfinfo', '-'])
    match = re.search(r'^Pages:\s+(\d+)\s*$', metadata, re.M)
    if not match:
        raise ValueError('PDF page count missing')
    total = int(match[1])
    if start < 1 or start > total:
        raise ValueError('Page outside document')
    stop = min(total, start + 5)
    raw = run(['pdftotext', '-raw', '-enc', 'UTF-8', '-f', str(start), '-l', str(stop), '-', '-'])
    parts = raw.split('\f')
    if parts and not parts[-1].strip():
        parts.pop()
    if len(parts) != stop - start + 1:
        raise ValueError('PDF page mapping mismatch')
    pages = []
    for i, part in enumerate(parts):
        text = re.sub(r'\s+', ' ', part).strip()
        pages.append({'page': start+i, 'text': text[:14000], 'truncated': len(text)>14000})
    return {'format':'pdf', 'parser':'poppler', 'totalPages':total, 'scannedThroughPage':stop, 'scanComplete':stop==total, 'pages':pages, 'links':[], 'warning':'PDF 첫 장을 1쪽으로 센 번호입니다. 표의 단위·행·열은 원본에서 확인하세요. 이미지 PDF의 OCR은 미지원입니다.'}
