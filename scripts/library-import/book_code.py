# a source's book code, as books.json keys the books. the Archives of Nethys and the notices spell some titles apart
# ("Potions and Poisons" and "Potions & Poisons", "Heroes of the Streets" and "Heroes of the Street"), so a name is
# matched to a book of books.json by its words without "and" and without a plural s; one with no book there keeps its
# own code
import re, json, os
BOOKS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'library', 'books.json')))
def plain(name):
    name = re.sub(r'^(PRPG |Pathfinder RPG |Pathfinder Roleplaying Game:? |The )', '', name.strip())
    c = re.sub(r'[^a-z0-9]+', '-', name.lower().replace("'", '').replace('’', '')).strip('-')
    return 'unchained' if c == 'pathfinder-unchained' else c
def loose(code):
    return '-'.join(re.sub(r's$', '', w) for w in code.split('-') if w != 'and')
LOOSE = {}
for key in BOOKS: LOOSE.setdefault(loose(key), key)
def code_of(name):
    c = plain(name)
    return c if c in BOOKS else LOOSE.get(loose(c), c)
