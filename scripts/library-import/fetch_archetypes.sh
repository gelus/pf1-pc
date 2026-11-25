#!/bin/sh
# fetch_archetypes.sh <Class>: reads a class's archetypes from Archives of Nethys (its list, each archetype's page,
# parsed into parsed/archetype/<class>.<archetype>.json) and collects the section 15 notices of their books from
# d20pfsrd's Paizo archetype pages for the class. prints each archetype with its source, and the books still missing
set -e
cd "$(dirname "$0")"
CLASS="$1"; LOWER=$(echo "$CLASS" | tr 'A-Z' 'a-z')
mkdir -p .pages/archetypes parsed/archetype
curl -sL -A "Mozilla/5.0" -o ".pages/$LOWER-archetypes.html" "https://aonprd.com/Archetypes.aspx?Class=$CLASS"
grep -o 'ArchetypeDisplay.aspx?FixedName=[^"]*' ".pages/$LOWER-archetypes.html" | sort -u | while read -r u; do
  n=$(echo "$u" | sed 's/.*FixedName=//')
  f=".pages/archetypes/$(echo "$n" | tr ' ' '_' | tr -cd 'A-Za-z0-9_')"
  [ -s "$f.txt" ] || { curl -sL -A "Mozilla/5.0" "https://aonprd.com/$(echo "$u" | sed 's/ /%20/g')" -o "$f.html"; python3 -I html2text.py "$f.html" > "$f.txt"; sleep 0.3; }
  slug=$(echo "$n" | sed "s/^$CLASS //" | tr 'A-Z' 'a-z' | sed "s/[^a-z0-9]\{1,\}/-/g; s/-$//")
  python3 -I parse_archetype.py "$f.txt" > "parsed/archetype/$LOWER.$slug.json" 2>/dev/null || echo "PARSE FAILED $n"
done
curl -sL -A "Mozilla/5.0" -o ".pages/d20-$LOWER-archetypes.html" "https://www.d20pfsrd.com/classes/core-classes/$LOWER/archetypes/"
grep -o "href=\"https://www.d20pfsrd.com/classes/core-classes/$LOWER/archetypes/paizo-[^\"]*/[^\"]*/\"" ".pages/d20-$LOWER-archetypes.html" | sed 's/href="//; s/"$//' | sort -u | xargs python3 -I notices.py
python3 -I - "$LOWER" <<'PY'
import json, glob, sys
books = json.load(open('../../public/library/books.json'))
for p in sorted(glob.glob(f'parsed/archetype/{sys.argv[1]}.*.json')):
    a = json.load(open(p)); b = next((x['book'] for x in a.get('sources', [a['source']]) if x['book'] in books), a['source']['book'])
    print(('   ' if b in books else 'NO NOTICE ') + f"{a['name']} [{b}] " + ' ; '.join(f"{f['name']}@{f['level']}" for f in a['features']))
PY
