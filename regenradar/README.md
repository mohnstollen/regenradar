# Regenradar (PWA) – DWD + basemap.de

| Zweck | Quelle |
|---|---|
| Hintergrundkarte | basemap.de Web Raster (BKG, amtliche Daten, CC BY 4.0), wahlweise Grau/Farbe; OSM als Alternative |
| Radar-Analyse & Warnung (1 km, 5 min, inkl. 2 h Vorhersage) | DWD RV-Komposit über Bright Sky `/radar` |
| Radarkarte | DWD-GeoServer WMS `dwd:Niederschlagsradar` |
| Aktuelles Wetter / Tageswerte | Bright Sky `/current_weather`, `/weather` |
| Amtliche Warnungen | Bright Sky `/alerts` |
| Außerhalb Deutschlands | RainViewer, Open-Meteo, Karte automatisch OSM |

## Lokal testen
```bash
python -m http.server 8000   # dann http://localhost:8000
```

## Deployment
```bash
git add . && git commit -m "basemap.de als Hintergrundkarte" && git push
```
