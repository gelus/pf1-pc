# drafts the authoring of a book's traits its file lacks (author/trait/<book>.json, by slug): each with no
# adjustments and an example expecting nothing; the library's checks then flag those whose text gives numbers
import glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from book_code import BOOKS
book = sys.argv[1]
path = os.path.join(HERE, 'author', 'trait', f'{book}.json')
author = json.load(open(path)) if os.path.exists(path) else {}
made = 0
for p in sorted(glob.glob(os.path.join(HERE, 'parsed', 'trait', '*.json'))):
    t = json.load(open(p))
    src = next((s for s in t['sources'] if s['book'] in BOOKS), None)
    if not src or src['book'] != book or t['slug'] in author: continue
    author[t['slug']] = {}; made += 1
json.dump(dict(sorted(author.items())), open(path, 'w'), indent=1, ensure_ascii=False)
print(book, made, 'drafted,', len(author), 'in all')
