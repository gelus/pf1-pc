# the section 15 notices of the rulebook line, from the PRD's OGL page, as books.json
import sys, re, json
text = open(sys.argv[1], encoding='utf8').read()
books = {}
for line in text.splitlines():
    m = re.match(r'\*\*(Pathfinder Roleplaying Game |Pathfinder Campaign Setting: )(.+?)\.?\*\*\.?\s*(©.*)$', line.strip())
    if not m: continue
    title = m.group(2).strip().rstrip('.')
    code = re.sub(r'[^a-z0-9]+', '-', title.lower().replace("'", '')).strip('-')
    if code == 'pathfinder-unchained': code = 'unchained'
    notice = re.sub(r'\*\*', '', line.strip())
    books[code] = {'title': (m.group(1) + title).strip(), 'copyright': notice}
print(json.dumps(books, indent=1, ensure_ascii=False))
