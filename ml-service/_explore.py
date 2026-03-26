import json

with open(r'c:\Users\victo\OneDrive\Área de Trabalho\dataset\data\competitions.json', encoding='utf-8') as f:
    comps = json.load(f)

seen = set()
for c in comps:
    key = (c['competition_id'], c['competition_name'])
    if key not in seen:
        seen.add(key)
        print(f"{c['competition_id']:>5} | {c['competition_name']:<30}")
