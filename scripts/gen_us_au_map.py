"""Generate public/api/us_au_map.json — conservative US->AU spelling map.

Single source of truth consumed by build_corpus.py (corpus text) and proxy.php
(Datamuse/dictionary results). Only unambiguous conversions are included:
meaning-dependent pairs (check/cheque, tire/tyre, curb/kerb, program/programme,
license/licence, practice/practise, meter-the-device) are deliberately absent.
"""
import json, os

M = {}

def add(us, au):
    M[us] = au

# ---- -or -> -our family (with safe inflections; NOTE: -ous/-ary forms keep -or-) ----
OUR = ['color', 'honor', 'labor', 'favor', 'flavor', 'neighbor', 'harbor', 'armor',
       'rumor', 'humor', 'odor', 'vapor', 'valor', 'vigor', 'savor', 'splendor',
       'endeavor', 'behavior', 'candor', 'clamor', 'demeanor', 'fervor', 'parlor',
       'rancor', 'tumor', 'ardor', 'saviour'.replace('iour', 'ior')]
for w in OUR:
    au = w[:-2] + 'our'
    add(w, au)
    add(w + 's', au + 's')
    add(w + 'ed', au + 'ed')
    add(w + 'ing', au + 'ing')
add('colorful', 'colourful'); add('colorless', 'colourless')
add('favorite', 'favourite'); add('favorites', 'favourites')
add('neighborhood', 'neighbourhood'); add('neighborhoods', 'neighbourhoods')
add('honorable', 'honourable')
add('laborer', 'labourer'); add('laborers', 'labourers')

# ---- -er -> -re family ----
add('center', 'centre'); add('centers', 'centres'); add('centered', 'centred'); add('centering', 'centring')
add('theater', 'theatre'); add('theaters', 'theatres')
add('meter', 'metre'); add('meters', 'metres')          # poetic/measure sense dominates in lyrics
add('liter', 'litre'); add('liters', 'litres')
add('fiber', 'fibre'); add('fibers', 'fibres')
add('caliber', 'calibre')
add('luster', 'lustre')
add('somber', 'sombre')
add('saber', 'sabre'); add('sabers', 'sabres')
add('specter', 'spectre'); add('specters', 'spectres')
add('sepulcher', 'sepulchre'); add('sepulchers', 'sepulchres')

# ---- -ize -> -ise (explicit words only — never a blanket rule: size/prize/seize) ----
IZE = ['realize', 'recognize', 'apologize', 'organize', 'criticize', 'memorize',
       'idolize', 'symbolize', 'agonize', 'baptize', 'civilize', 'colonize',
       'energize', 'fantasize', 'harmonize', 'hypnotize', 'immortalize',
       'legalize', 'minimize', 'maximize', 'mesmerize', 'modernize',
       'romanticize', 'scrutinize', 'stabilize', 'sterilize', 'summarize',
       'sympathize', 'tantalize', 'terrorize', 'theorize', 'vandalize',
       'visualize', 'vocalize', 'emphasize', 'characterize']
for w in IZE:
    au = w[:-3] + 'ise'
    add(w, au)
    add(w + 's', au + 's')
    add(w + 'd', au + 'd')
    add(w[:-1] + 'ing', au[:-1] + 'ing')
add('realization', 'realisation'); add('organization', 'organisation')
add('organizations', 'organisations'); add('civilization', 'civilisation')
add('civilizations', 'civilisations')

# ---- -yze -> -yse ----
for w in ['analyze', 'paralyze', 'catalyze']:
    au = w[:-3] + 'yse'
    add(w, au); add(w + 's', au + 's'); add(w + 'd', au + 'd')
    add(w[:-1] + 'ing', au[:-1] + 'ing')

# ---- -og -> -ogue ----
add('catalog', 'catalogue'); add('catalogs', 'catalogues')
add('dialog', 'dialogue'); add('dialogs', 'dialogues')
add('monolog', 'monologue'); add('epilog', 'epilogue'); add('prolog', 'prologue')

# ---- singles ----
add('gray', 'grey'); add('grays', 'greys'); add('grayed', 'greyed'); add('graying', 'greying')
add('mold', 'mould'); add('molds', 'moulds'); add('molded', 'moulded'); add('molding', 'moulding'); add('moldy', 'mouldy')
add('smolder', 'smoulder'); add('smoldered', 'smouldered'); add('smoldering', 'smouldering')
add('plow', 'plough'); add('plows', 'ploughs'); add('plowed', 'ploughed'); add('plowing', 'ploughing')
add('pajamas', 'pyjamas')
add('jewelry', 'jewellery')
add('marvelous', 'marvellous')
add('traveling', 'travelling'); add('traveled', 'travelled'); add('traveler', 'traveller'); add('travelers', 'travellers')
add('canceled', 'cancelled'); add('canceling', 'cancelling')
add('counselor', 'counsellor'); add('counselors', 'counsellors')
add('woolen', 'woollen')
add('fulfill', 'fulfil'); add('fulfillment', 'fulfilment')
add('enrollment', 'enrolment')
add('defense', 'defence'); add('defenses', 'defences')
add('offense', 'offence'); add('offenses', 'offences')
add('pretense', 'pretence')

out = os.path.join(os.path.dirname(__file__), '..', 'public', 'api', 'us_au_map.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(M, f, indent=1, sort_keys=True)
print(f'{len(M)} mappings -> {out}')
