# collects the section 15 copyright notices of Paizo books from d20pfsrd pages (each page ends with the notices of the
# books it quotes) into public/library/books.json, under the codes the Archives of Nethys sources map to ("Heroes of
# the Darklands" is heroes-of-the-darklands). books already there keep their notice (Paizo's own OGL page gave
# those); third-party notices are left out
import sys, re, json, os, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
BOOKS = os.path.join(HERE, '..', '..', 'public', 'library', 'books.json')
PREFIX = r'^(Pathfinder (?:Roleplaying Game|Player Companion|Campaign Setting|Module|Adventure Path|Society Scenario|Pawns|Flip-Mat)(?::\s*|\s+))'
def text_of(url):
    folder = os.path.join(HERE, '.pages', 'd20'); os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, re.sub(r'[^a-z0-9]+', '_', url.lower())[-120:] + '.html')
    if not os.path.exists(path):
        subprocess.run(['curl', '-sL', '-A', 'Mozilla/5.0', '-o', path, url]); time.sleep(0.4)
    return subprocess.run([sys.executable, '-I', os.path.join(HERE, 'html2text.py'), path], capture_output=True, text=True).stdout
def notices(url):
    text = text_of(url)
    m = re.search(r'Section 15: Copyright Notice\s*(.*?)(?:####|\Z)', text, re.S)
    return [l.strip() for l in (m.group(1) if m else '').split('\n') if '©' in l or 'Copyright' in l]
def code_of(line):
    m = re.match(PREFIX + r'(.+?)\.?\s*(?:©|Copyright)', line)
    if not m: return None
    # codes as the Archives of Nethys names the books, without a leading "The" ("The Inner Sea World Guide")
    title = re.sub(r'^The\s+', '', m.group(2).strip().rstrip('.,'))
    c = re.sub(r'[^a-z0-9]+', '-', title.lower().replace("'", '').replace('’', '')).strip('-')
    return 'unchained' if c == 'pathfinder-unchained' else c
if __name__ == '__main__':
    books = json.load(open(BOOKS)); added = []
    for url in sys.argv[1:]:
        for line in notices(url):
            code = code_of(line)
            if not code or 'paizo' not in line.lower() or code in books: continue
            title = re.match(PREFIX + r'(.+?)\.?\s*(?:©|Copyright)', line)
            books[code] = {'title': (title.group(1) + title.group(2)).strip().rstrip('.'), 'copyright': line}
            added.append(code)
    json.dump(books, open(BOOKS, 'w'), indent=1, ensure_ascii=False); open(BOOKS, 'a').write('\n')
    print(f'{len(added)} books added: {", ".join(added)}')
