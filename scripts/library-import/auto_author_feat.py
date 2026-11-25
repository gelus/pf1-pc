# drafts the authoring of a book's feats its authoring file lacks (author/feat/<book>.json): each with no
# adjustments and an example expecting nothing. the library's checks then say which give numbers the sheet keeps,
# and those are written by hand (patch_feats.py)
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from book_code import BOOKS
book = sys.argv[1]
path = os.path.join(HERE, 'author', 'feat', f'{book}.json')
author = json.load(open(path)) if os.path.exists(path) else {}
made = 0
for p in sorted(glob.glob(os.path.join(HERE, 'parsed', 'feat', '*.json'))):
    feat = json.load(open(p))
    src = next((s for s in feat['sources'] if s['book'] in BOOKS), None)
    if not src or src['book'] != book or feat['name'] in author: continue
    author[feat['name']] = {}; made += 1
json.dump(dict(sorted(author.items())), open(path, 'w'), indent=1, ensure_ascii=False)
print(book, made, 'drafted,', len(author), 'in all')
