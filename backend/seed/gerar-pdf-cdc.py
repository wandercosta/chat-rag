"""Gera um HTML limpo do CDC (Lei 8.078/1990) a partir da pagina do Planalto:
remove trechos revogados (riscados) e notas de alteracao, mantendo so o texto
vigente da lei. O HTML e depois impresso em PDF pelo Chrome headless."""
import html
import re
import sys
from html.parser import HTMLParser

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
for enc in ('utf-8', 'cp1252'):
    try:
        text = raw.decode(enc)
        break
    except UnicodeDecodeError:
        continue


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.paras = []
        self.cur = []

    def handle_starttag(self, tag, attrs):
        if tag in ('strike', 's', 'del', 'script', 'style', 'head'):
            self.skip += 1
        if tag in ('p', 'br', 'div', 'tr', 'h1', 'h2', 'h3'):
            self.flush()

    def handle_endtag(self, tag):
        if tag in ('strike', 's', 'del', 'script', 'style', 'head'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'tr', 'h1', 'h2', 'h3'):
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            self.cur.append(data)

    def flush(self):
        t = re.sub(r'\s+', ' ', ''.join(self.cur)).strip()
        self.cur = []
        if t:
            self.paras.append(t)


p = P()
p.feed(text)
p.flush()

paras = p.paras
start = next(i for i, t in enumerate(paras) if t.startswith('Dispõe sobre a proteção do consumidor'))
end = max(i for i, t in enumerate(paras) if t.startswith('Brasília'))
paras = paras[start:end + 1]

# Notas de alteracao ("(Redação dada pela Lei ...)", "(Incluído pela ...)").
note = re.compile(r'\((?:Redação|Incluído|Incluída|Vide|Vigência|Revogado|Revogada|Renumerado|Acrescido|Promulgação)[^)]*\)')
clean = []
for t in paras:
    t = note.sub('', t).strip()
    t = re.sub(r'\s+([.,;:])', r'\1', t)
    if t and not re.fullmatch(r'[\s.()]*', t):
        clean.append(t)

def cls(t):
    if re.match(r'^(TÍTULO|CAPÍTULO|SEÇÃO)\b', t):
        return 'h'
    if re.match(r'^Art\. ?\d', t):
        return 'art'
    return ''

body = '\n'.join(f'<p class="{cls(t)}">{html.escape(t)}</p>' for t in clean)
out = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Código de Defesa do Consumidor - Lei nº 8.078/1990</title>
<style>
@page {{ size: A4; margin: 22mm 20mm; }}
body {{ font-family: Georgia, serif; font-size: 11pt; line-height: 1.45; color: #111; }}
h1 {{ font-size: 16pt; text-align: center; margin: 0 0 4pt; }}
.sub {{ text-align: center; font-size: 10pt; color: #444; margin-bottom: 14pt; }}
p {{ margin: 0 0 5pt; text-align: justify; }}
p.h {{ font-weight: bold; text-align: center; margin-top: 12pt; }}
p.art {{ margin-top: 7pt; }}
</style></head><body>
<h1>Código de Defesa do Consumidor</h1>
<div class="sub">Lei nº 8.078, de 11 de setembro de 1990 — texto vigente, compilado a partir de planalto.gov.br (domínio público, art. 8º, IV, da Lei 9.610/1998)</div>
{body}
</body></html>'''
open(dst, 'w', encoding='utf-8').write(out)
print(len(clean), 'paragrafos;', sum(1 for t in clean if cls(t) == 'art'), 'artigos')
