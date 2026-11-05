"""Promote a verified additive municipal catalog without losing existing sources."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

spec = importlib.util.spec_from_file_location('municipal_merger', Path(__file__).with_name('municipal-catalog-merge.py'))
merger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merger)


def promote(current_path, candidate_path, registered):
    current_path, candidate_path = Path(current_path), Path(candidate_path)
    if current_path.resolve() == candidate_path.resolve():
        raise ValueError('기존 자료와 새 자료는 다른 파일이어야 합니다')
    if current_path.stat().st_size > 20 * 1024 * 1024 or candidate_path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('자료 크기 제한 초과')
    old_bytes, candidate_bytes = current_path.read_bytes(), candidate_path.read_bytes()
    old = json.loads(old_bytes.decode('utf-8-sig'))
    new = json.loads(candidate_bytes.decode('utf-8-sig'))
    if not isinstance(old, dict) or not isinstance(old.get('sources'), list) or not isinstance(new, dict) or not isinstance(new.get('sources'), list):
        raise ValueError('자료 형식 오류')
    if not old['sources'] or len(new['sources']) > 5000:
        raise ValueError('출처 개수 오류')
    current = {}
    for source in old['sources']:
        merger.validate(source, registered)
        if source['source'] in current:
            raise ValueError('기존 출처 중복')
        current[source['source']] = source
    proposed = {}
    for source in new['sources']:
        merger.validate(source, registered)
        url = urlparse(source['source'])
        if ';jsessionid=' in url.path.lower() or any(k.lower() in {'jsessionid', 'sessionid', 'session_id', 'token', 'access_token'} for k, _ in parse_qsl(url.query, keep_blank_values=True)):
            raise ValueError('임시 출처 주소')
        if source['source'] in proposed:
            raise ValueError('새 출처 중복')
        if source['source'] not in current and not source['items']:
            raise ValueError('검증된 사업이 없는 새 출처')
        proposed[source['source']] = source
    if any(proposed.get(key) != value for key, value in current.items()):
        raise ValueError('기존 출처가 누락되었거나 변경됨')
    additions = len(proposed) - len(current)
    if additions < 1:
        raise ValueError('추가된 출처 없음')
    backup = current_path.with_name(current_path.name + '.' + uuid.uuid4().hex + '.bak')
    fd, temp = tempfile.mkstemp(prefix='municipal-promote-', suffix='.tmp', dir=current_path.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(candidate_bytes)
            out.flush()
            os.fsync(out.fileno())
        if hashlib.sha256(current_path.read_bytes()).digest() != hashlib.sha256(old_bytes).digest():
            raise ValueError('갱신 중 기존 자료가 변경됨')
        with backup.open('xb') as out:
            out.write(old_bytes)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, current_path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return {'previousSources': len(current), 'addedSources': additions, 'totalSources': len(proposed), 'backup': str(backup)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('current')
    parser.add_argument('candidate')
    args = parser.parse_args()
    registry = merger.read_json(Path(__file__).with_name('catalog-institutions.json'))
    counts = Counter(urlparse(record['url']).hostname for record in registry['records'] if urlparse(record['url']).hostname and '(편성 당시)' not in record['institution'])
    hosts = {host for host, count in counts.items() if count == 1}
    print(json.dumps(promote(args.current, args.candidate, hosts), ensure_ascii=False))
