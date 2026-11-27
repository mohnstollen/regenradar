#!/usr/bin/env python3
"""Schneekarte: Schneehöhe aus DWD ICON-D2 (2,2 km, Mitteleuropa) und ICON-EU (6,5 km, Europa) als Kartenbilder.

Lädt den neuesten verfügbaren Lauf (Analyse, +0 h) von opendata.dwd.de, teilt die Schneehöhe in Stufen ein und
schreibt je Modell ein PNG mit Farbpalette in Web-Mercator (passt direkt als Leaflet-imageOverlay) sowie schnee.json
mit Lauf, Bildgrenzen und Stufen. Im ICON-D2-Gebiet ist das ICON-EU-Bild durchsichtig, damit sich nichts widerspricht.

Aufruf: python3 tools/schneekarte.py <Ausgabeordner>      braucht: eccodes numpy pillow
Läuft regelmäßig in .github/workflows/schneekarte.yml und landet auf dem Branch „schneekarte“.
"""
import bz2, datetime as dt, json, math, os, sys, urllib.request

import eccodes
import numpy as np
from PIL import Image

DWD = 'https://opendata.dwd.de/weather/nwp'
MODELS = {
    'd2': ('icon-d2', 'icon-d2_germany_regular-lat-lon_single-level_{run}_000_2d_h_snow.grib2.bz2'),
    'eu': ('icon-eu', 'icon-eu_europe_regular-lat-lon_single-level_{run}_000_H_SNOW.grib2.bz2'),
}
# Stufen in cm: unter 1 cm durchsichtig
STEPS = [1, 5, 10, 20, 50, 100, 200]
COLORS = ['#c6ecff', '#7fcdf5', '#2f9be0', '#1f5fbf', '#5b2fb0', '#a12aa8', '#5a0f5e']
MISSING = 9000   # ICON-D2: 9999 außerhalb des Modellgebiets


def latest(model):
    """Neuester Lauf, dessen Datei schon da ist (Läufe alle 3 h, Bereitstellung ca. 1–4 h später)"""
    name, pattern = MODELS[model]
    t = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    t -= dt.timedelta(hours=t.hour % 3)
    for _ in range(12):
        run = t.strftime('%Y%m%d%H')
        url = f'{DWD}/{name}/grib/{t:%H}/h_snow/' + pattern.format(run=run)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30):
                return t, url
        except Exception:
            t -= dt.timedelta(hours=3)
    raise SystemExit(f'{model}: kein Lauf gefunden')


def read(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        data = bz2.decompress(r.read())
    g = eccodes.codes_new_from_message(data)
    try:
        k = lambda n: eccodes.codes_get(g, n)
        ni, nj, d = k('Ni'), k('Nj'), k('iDirectionIncrementInDegrees')
        lat0, lon0 = k('latitudeOfFirstGridPointInDegrees'), k('longitudeOfFirstGridPointInDegrees')
        if lon0 > 180:
            lon0 -= 360
        if k('jScansPositively') != 1:
            raise SystemExit('unerwartete Gitterrichtung')
        v = eccodes.codes_get_values(g).reshape(nj, ni)
    finally:
        eccodes.codes_release(g)
    return {'v': v, 'lat0': lat0, 'lon0': lon0, 'd': d, 'ni': ni, 'nj': nj}


def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def project(f):
    """Zeilen des Breitengrad-Gitters auf Web-Mercator verteilen; Spalten bleiben (gleiche Längenauflösung)"""
    s, n = f['lat0'] - f['d'] / 2, f['lat0'] + (f['nj'] - 0.5) * f['d']
    ms, mn = merc(s), merc(n)
    h = round((mn - ms) / math.radians(f['d']))
    m = mn - (np.arange(h) + 0.5) * (mn - ms) / h
    lat = np.degrees(np.arctan(np.sinh(m)))
    rows = np.clip(np.round((lat - f['lat0']) / f['d']).astype(int), 0, f['nj'] - 1)
    west, east = f['lon0'] - f['d'] / 2, f['lon0'] + (f['ni'] - 0.5) * f['d']
    return rows, lat, [[round(s, 4), round(west, 4)], [round(n, 4), round(east, 4)]]


def classes(v):
    cm = v * 100
    c = np.zeros(v.shape, np.uint8)
    for i, t in enumerate(STEPS):
        c[cm >= t] = i + 1
    c[v >= MISSING] = 0
    return c


def save(c, path):
    img = Image.fromarray(c, 'P')
    pal = [0, 0, 0]
    for h in COLORS:
        pal += [int(h[i:i + 2], 16) for i in (1, 3, 5)]
    img.putpalette(pal + [0] * (768 - len(pal)))
    img.save(path, optimize=True, transparency=0)


def main(out):
    os.makedirs(out, exist_ok=True)
    runs, fields = {}, {}
    for m in MODELS:
        runs[m], url = latest(m)
        print(m, runs[m].isoformat(), url, file=sys.stderr)
        fields[m] = read(url)
    meta = {'made': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'), 'steps': STEPS, 'colors': COLORS, 'layers': []}
    d2 = fields['d2']
    for m in ('eu', 'd2'):
        f = fields[m]
        rows, lat, bounds = project(f)
        c = classes(f['v'])[rows]   # rows läuft von Nord nach Süd: Bild oben = Norden
        if m == 'eu':
            # Wo ICON-D2 gilt, ICON-EU ausblenden
            lon = f['lon0'] + np.arange(f['ni']) * f['d']
            jj = np.round((lat - d2['lat0']) / d2['d']).astype(int)
            ii = np.round((lon - d2['lon0']) / d2['d']).astype(int)
            okj, oki = (jj >= 0) & (jj < d2['nj']), (ii >= 0) & (ii < d2['ni'])
            inside = np.zeros(c.shape, bool)
            sub = d2['v'][np.clip(jj, 0, d2['nj'] - 1)][:, np.clip(ii, 0, d2['ni'] - 1)] < MISSING
            inside[np.ix_(okj, oki)] = sub[np.ix_(okj, oki)]
            c[inside] = 0
        name = f'schnee-{m}.png'
        save(c, os.path.join(out, name))
        meta['layers'].append({'model': 'ICON-D2' if m == 'd2' else 'ICON-EU', 'run': runs[m].isoformat(timespec='minutes'),
                               'image': name, 'bounds': bounds})
        print(name, c.shape, os.path.getsize(os.path.join(out, name)) // 1024, 'kB', file=sys.stderr)
    with open(os.path.join(out, 'schnee.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'schneekarte')
