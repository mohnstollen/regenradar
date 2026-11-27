#!/usr/bin/env python3
"""Erzeugt wetter/warngebiete/ – vereinfachte Umrisse der MeteoAlarm-Warngebiete für Orte außerhalb Deutschlands.

MeteoAlarm-Warnungen nennen ihr Gebiet je nach Land unterschiedlich:
  * als Polygon im CAP-Text (z. B. Schweiz, Österreich teilweise, Skandinavien) – braucht keine Daten hier,
  * als EMMA_ID (MeteoAlarm-Gebietscode),
  * als NUTS2/NUTS3-Code (EU-Statistikregionen, teils noch nach NUTS 2010 oder 2013, z. B. Frankreich),
  * Tschechien: CISORP (Verwaltungsbezirk einer Gemeinde mit erweiterter Zuständigkeit, ORP) bzw. EMMA_ID „CZ0“ + CISORP.

Ausgabe:
  index.json   je Land: MeteoAlarm-Feed, Umgebungsrechteck und grober Umriss (zum Erkennen des Landes)
  <LAND>.json  Umrisse aller EMMA- und NUTS-Gebiete des Landes; für CZ zusätzlich die Gemeinden (Mittelpunkt → ORP)

Geometrie: Koordinaten in Tausendstel Grad als ganze Zahlen, je Ring flach [lon, lat, lon, lat, …].
Ein Gebiet ist eine Liste von Polygonen, ein Polygon eine Liste von Ringen (gerade/ungerade-Regel, Löcher inbegriffen).

Quellen (werden nach tools/.cache geladen):
  * EMMA_ID-Umrisse: geocodes.json aus dem PyPI-Paket „meteoalarm“ 0.3.0 (MIT, Daten von MeteoAlarm)
  * NUTS 2024/2021/2016/2013/2010, 1:10 Mio.: © EuroGeographics für die Verwaltungsgrenzen (GISCO, Eurostat)
  * Gemeinden CZ: GISCO LAU 2024 (© EuroGeographics); Zuordnung Gemeinde → ORP: ČSÚ, Číselník 65 / Vazba 43
Aufruf: python3 tools/warngebiete.py
"""
import csv, datetime, json, os, subprocess, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')
OUT = os.path.join(ROOT, 'wetter', 'warngebiete')
GISCO = 'https://gisco-services.ec.europa.eu/distribution/v2'
NUTS_YEARS = [2024, 2021, 2016, 2013, 2010]   # neuere zuerst: gleicher Code → neuester Umriss
TOL_AREA, TOL_OUTLINE = 0.004, 0.03            # Vereinfachung in Grad (~400 m bzw. ~3 km)

# MeteoAlarm-Länder (ohne Deutschland – dort gelten die DWD-Warnungen) → Feed-Name; NUTS-Kürzel, wo abweichend
COUNTRIES = {
    'AD': 'andorra', 'AT': 'austria', 'BA': 'bosnia-herzegovina', 'BE': 'belgium', 'BG': 'bulgaria', 'CH': 'switzerland',
    'CY': 'cyprus', 'CZ': 'czechia', 'DK': 'denmark', 'EE': 'estonia', 'ES': 'spain', 'FI': 'finland', 'FR': 'france',
    'GR': 'greece', 'HR': 'croatia', 'HU': 'hungary', 'IE': 'ireland', 'IL': 'israel', 'IS': 'iceland', 'IT': 'italy',
    'LT': 'lithuania', 'LU': 'luxembourg', 'LV': 'latvia', 'MD': 'moldova', 'ME': 'montenegro',
    'MK': 'republic-of-north-macedonia', 'MT': 'malta', 'NL': 'netherlands', 'NO': 'norway', 'PL': 'poland',
    'PT': 'portugal', 'RO': 'romania', 'RS': 'serbia', 'SE': 'sweden', 'SI': 'slovenia', 'SK': 'slovakia',
    'UA': 'ukraine', 'UK': 'united-kingdom',
}
NUTS_CC = {'GR': 'EL'}


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('lade', url, file=sys.stderr)
        urllib.request.urlretrieve(url, path + '.part')
        os.replace(path + '.part', path)
    return path


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ---------- Geometrie ----------
def dp(pts, tol):
    """Douglas-Peucker für einen offenen Linienzug"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1; den = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            if den == 0:
                d = (x - x1) ** 2 + (y - y1) ** 2
            else:
                t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / den))
                d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > tol * tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def ring_area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def simplify_ring(ring, tol):
    ring = [(float(x), float(y)) for x, y, *_ in ring]
    if ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < 3:
        return None
    # an zwei weit auseinanderliegenden Punkten teilen, damit der geschlossene Ring sauber vereinfacht wird
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    out = dp(ring[:far + 1], tol)[:-1] + dp(ring[far:] + [ring[0]], tol)[:-1]
    if len(out) < 3:
        return None
    flat, last = [], None
    for x, y in out:
        p = (round(x * 1000), round(y * 1000))
        if p != last:
            flat += p; last = p
    return flat if len(flat) >= 6 else None


def polygons(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Polygon':
        return [c]
    if t == 'MultiPolygon':
        return c
    if t == 'GeometryCollection':
        return [p for g in geom['geometries'] for p in polygons(g)]
    return []


def simplify(geom, tol, min_area=0.0):
    out = []
    for poly in polygons(geom):
        if min_area and ring_area(poly[0]) < min_area:
            continue   # kleine Inseln im groben Landesumriss weglassen
        rings = [r for r in (simplify_ring(r, tol) for r in poly) if r]
        if rings:
            out.append(rings)
    return out


def bbox(geoms):
    xs = [v for g in geoms for poly in g for r in poly for v in r[0::2]]
    ys = [v for g in geoms for poly in g for r in poly for v in r[1::2]]
    return [min(xs), min(ys), max(xs), max(ys)] if xs else None


def centroid(geom):
    """Flächenschwerpunkt des größten Polygons (für Gemeinden genügt das)"""
    ring = max((p[0] for p in polygons(geom)), key=ring_area)
    a = cx = cy = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1][:2]; x1, y1 = ring[i][:2]
        f = x0 * y1 - x1 * y0
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
    if a == 0:
        return ring[0][:2]
    return cx / (3 * a), cy / (3 * a)


# ---------- Quellen ----------
def emma_geocodes():
    whl = os.path.join(CACHE, 'meteoalarm-0.3.0-py3-none-any.whl')
    if not os.path.exists(whl):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run([sys.executable, '-m', 'pip', 'download', '--no-deps', '-q', 'meteoalarm==0.3.0', '-d', CACHE], check=True)
    with zipfile.ZipFile(whl) as z:
        return json.loads(z.read('meteoalarm/assets/geocodes.json'))['features']


def nuts(level, year):
    return load_json(fetch(f'{GISCO}/nuts/geojson/NUTS_RG_10M_{year}_4326_LEVL_{level}.geojson',
                           f'nuts{level}_{year}.geojson'))['features']


def cz_gemeinden():
    """Gemeinden CZ: Mittelpunkt und ORP-Code (CISORP)"""
    day = datetime.date.today().strftime('%d.%m.%Y')
    vaz = fetch('https://apl2.czso.cz/iSMS/do_cis_export?kodcis=65&typdat=1&cisvaz=43_1182'
                f'&datpohl={day}&cisjaz=203&format=2&separator=%2C', 'cz_orp_obec.csv')
    with open(vaz, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    orp_of = {r['chodnota2']: r['chodnota1'] for r in rows}
    orp_name = {r['chodnota1']: r['text1'] for r in rows}
    lau = fetch(f'{GISCO}/lau/geojson/LAU_RG_01M_2024_4326.geojson', 'lau_2024.geojson')
    cz = os.path.join(CACHE, 'lau_2024_cz.json')
    if not os.path.exists(cz):
        feats = [f for f in load_json(lau)['features'] if f['properties']['CNTR_CODE'] == 'CZ']
        with open(cz, 'w', encoding='utf-8') as f:
            json.dump(feats, f)
    pts, missing = [], 0
    for f in load_json(cz):
        code = f['properties']['GISCO_ID'].split('_')[1]
        orp = orp_of.get(code)
        if not orp:
            missing += 1; continue
        x, y = centroid(f['geometry'])
        pts += [round(y * 1000), round(x * 1000), int(orp)]
    print(f'CZ: {len(pts) // 3} Gemeinden, {len(orp_name)} ORP, ohne Zuordnung {missing}', file=sys.stderr)
    return pts, orp_name


def main():
    os.makedirs(OUT, exist_ok=True)
    areas = {cc: {} for cc in COUNTRIES}
    outline = {}

    for f in emma_geocodes():
        p = f['properties']; cc = p['country']
        if cc in areas and f.get('geometry'):
            g = simplify(f['geometry'], TOL_AREA)
            if g:
                areas[cc][p['code']] = g
    nuts_cc = {NUTS_CC.get(cc, cc): cc for cc in COUNTRIES}
    for year in NUTS_YEARS:
        for level in (2, 3):
            for f in nuts(level, year):
                p = f['properties']; cc = nuts_cc.get(p['CNTR_CODE'])
                if cc and p['NUTS_ID'] not in areas[cc]:
                    g = simplify(f['geometry'], TOL_AREA)
                    if g:
                        areas[cc][p['NUTS_ID']] = g
        for f in nuts(0, year):
            cc = nuts_cc.get(f['properties']['CNTR_CODE'])
            if cc and cc not in outline:
                outline[cc] = simplify(f['geometry'], TOL_OUTLINE, 0.002)

    cz_pts, cz_names = cz_gemeinden()
    index = {}
    for cc, slug in COUNTRIES.items():
        a = areas[cc]
        if cc not in outline:   # kein NUTS-Land (z. B. Andorra, Israel, Moldau): Umriss aus den EMMA-Gebieten
            outline[cc] = [p for g in a.values() for p in simplify(
                {'type': 'MultiPolygon', 'coordinates': [[[(r[i] / 1000, r[i + 1] / 1000) for i in range(0, len(r), 2)] for r in poly] for poly in g]},
                TOL_OUTLINE)]
        data = {'areas': a}
        if cc == 'CZ':
            data['orp'] = cz_pts
            data['orpNames'] = cz_names
        with open(os.path.join(OUT, f'{cc}.json'), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        index[cc] = {'feed': slug, 'bbox': bbox([outline[cc]]) if outline[cc] else bbox(a.values()), 'outline': outline[cc]}
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'made': datetime.date.today().isoformat(), 'countries': index}, f, separators=(',', ':'))
    for name in sorted(os.listdir(OUT)):
        print(f'{name:12} {os.path.getsize(os.path.join(OUT, name)) // 1024:6} kB', file=sys.stderr)


if __name__ == '__main__':
    main()
