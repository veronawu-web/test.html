import re, json, base64, gzip, sys, os, html
src=open(sys.argv[1],encoding='utf-8').read()
def block(t):
    m=re.search(r'<script type="__bundler/%s">\n(.*?)\n  </script>'%t, src, re.S)
    return m.group(1)
man=json.loads(block('manifest'))
ext=json.loads(block('ext_resources'))
tpl=json.loads(block('template'))
os.makedirs('out',exist_ok=True)
open('out/template.html','w').write(tpl)
idmap={e['uuid']:e['id'] for e in ext}
for k,v in man.items():
    data=base64.b64decode(v['data'])
    if v.get('compressed'): data=gzip.decompress(data)
    name=idmap.get(k,k)
    safe=re.sub(r'[^A-Za-z0-9._@-]','_',name)
    open('out/'+safe,'wb').write(data)
    print(k, v['mime'], v.get('compressed'), len(data), name)
