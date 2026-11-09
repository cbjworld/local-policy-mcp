import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('review', Path(__file__).with_name('municipal-content-review.py'))
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
item = {'name': '청년 지원', 'content': '연 10만원', 'location': {'table': 1, 'row': 2}, 'nameColumn': '사업명'}
old = {'source': 'https://www.nowon.kr/plan', 'items': [item], 'skipped': []}
metadata = {'source': old['source'], 'items': [{**item, 'nameColumn': '정책명'}], 'skipped': []}
assert review.compare(old, metadata)['status'] == 'content_unchanged'
new = {'source': old['source'], 'items': [{**item, 'content': '연 20만원'}], 'skipped': []}
assert review.compare(old, new)['changed'][0]['fields'] == ['content']
new['items'].append({'name': '새 사업', 'content': '지원', 'location': {'table': 1, 'row': 3}})
assert review.compare(old, new)['added'] == [{'table': 1, 'row': 3}]
new['skipped'].append({'reason': 'unreadable'})
assert review.compare(old, new)['skippedChanged']
try:
    review.compare(old, {'source': old['source'], 'items': []})
except ValueError:
    pass
else:
    raise AssertionError('빈 추출 결과를 정상 결과로 처리했습니다.')
print('PASS: content-only comparison, changed amounts, additions, skipped rows and empty extraction')
