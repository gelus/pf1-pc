import sys, re, html
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s): super().__init__(); s.out=[]; s.skip=0
    def handle_starttag(s,t,a):
        if t in('script','style'): s.skip+=1
        if t in('br','p','div','tr','li','h1','h2','h3','h4','table'): s.out.append('\n')
        if t in('h1','h2','h3','h4'): s.out.append('#'*int(t[1])+' ')
        if t in('b','strong'): s.out.append('**')
        if t=='li': s.out.append('- ')
        if t in('td','th'): s.out.append(' | ')
    def handle_endtag(s,t):
        if t in('script','style'): s.skip-=1
        if t in('b','strong'): s.out.append('**')
        if t in('p','h1','h2','h3','h4','table'): s.out.append('\n')
    def handle_data(s,d):
        if not s.skip: s.out.append(d)
p=P(); src=open(sys.argv[1],encoding='utf8',errors='replace').read()
m=re.search(r'id="main"(.*)',src,re.S)
p.feed(m.group(1) if m else src)
t=''.join(p.out); t=re.sub(r'[ \t]+',' ',t); t=re.sub(r'\n\s*\n+','\n\n',t)
print(t)
