# reads (and caches in .pages/spells, as fetch_feats.py does) the Archives of Nethys page of every spell its spell list
# names (.pages/spell-list.html, https://aonprd.com/Spells.aspx?Class=All), a few at a time
import html, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
FOLDER = os.path.join(HERE, '.pages', 'spells'); os.makedirs(FOLDER, exist_ok=True)
names = sorted(set(html.unescape(n).strip() for n in re.findall(r'href="SpellDisplay\.aspx\?ItemName=([^"]+)"', open(os.path.join(HERE, '.pages', 'spell-list.html'), encoding='utf8').read())))
def get(name):
    path = os.path.join(FOLDER, re.sub(r'[^A-Za-z0-9]+', '_', name) + '.txt')
    if os.path.exists(path) and os.path.getsize(path) > 200: return
    url = 'https://aonprd.com/SpellDisplay.aspx?ItemName=' + name.replace(' ', '%20')
    for attempt in range(3):
        page = subprocess.run(['curl', '-sL', '--max-time', '60', '-A', 'Mozilla/5.0', url], capture_output=True, text=True).stdout
        if 'Source' in page: break
        time.sleep(3)
    tmp = path + '.html'; open(tmp, 'w').write(page)
    open(path, 'w').write(subprocess.run([sys.executable, '-I', os.path.join(HERE, 'html2text.py'), tmp], capture_output=True, text=True).stdout)
    os.remove(tmp)
    time.sleep(0.3)
with ThreadPoolExecutor(4) as pool: list(pool.map(get, names))
print(len(names), 'spells,', len([f for f in os.listdir(FOLDER) if f.endswith('.txt')]), 'pages cached')
