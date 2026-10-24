import json
d = json.load(open('contents.json', encoding='utf-8'))
xmls = sorted([x for x in d if x['name'].lower().endswith('.xml')], key=lambda x: x['name'].lower())
print('XML COUNT:', len(xmls))
for x in xmls:
    print('%s\t%d\t%s' % (x['name'], x['size'], x['download_url']))
