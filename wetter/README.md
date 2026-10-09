# Wetter-App (PWA) – DWD + Modellvergleich

| Bereich | Quelle |
|---|---|
| Aktuelle Temperatur & Icon | Bright Sky `/current_weather` – nächstgelegene DWD-Station |
| 12-Stunden-Verlauf | umschaltbar: DWD MOSMIX (Bright Sky) oder Open-Meteo (`models=`) |
| Warnungen | Bright Sky `/alerts` – amtliche DWD-Warnungen |
| Regenradar / Regen-Hinweis | DWD-GeoServer WMS, Bright Sky `/radar` |
| Satellitenbild | EUMETSAT View WMS |
| Hintergrundkarte | basemap.de (BKG) / OpenStreetMap |

## Modelle (Open-Meteo `models=`)
icon_d2, icon_seamless, ecmwf_ifs025, ecmwf_aifs025, knmi_harmonie_arome_europe,
meteofrance_seamless, ukmo_seamless, gfs_seamless, best_match

Open-Meteo: kostenlos für nicht-kommerzielle Nutzung (< 10.000 Abrufe/Tag), Daten CC BY 4.0.

Lokal testen: `python -m http.server 8000` → http://localhost:8000
