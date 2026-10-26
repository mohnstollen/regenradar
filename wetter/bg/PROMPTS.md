# Hintergrundfotos – Prompts für einen Bildgenerator

Die App zeigt diese Fotos statt der gezeichneten Szene, sobald sie hier im Ordner `wetter/bg/` liegen.
Fehlt ein Foto, nimmt sie das nächstpassende Foto oder die Zeichnung (Tabelle unten).

## So gehst du vor

- **Format:** Hochformat 9:16, möglichst mindestens 1080 × 1920 Pixel. PNG oder JPG reicht, ich wandle die Bilder in WebP um.
- **Alle Bilder in einem Chat erzeugen** (z. B. ChatGPT oder Gemini). Ab dem zweiten Bild hilft der Zusatz
  *„Same landscape and same viewpoint as the previous images.“* Dann sieht es nach demselben Ort zu verschiedenen Zeiten aus.
- **Kein fallender Regen oder Schnee und keine Blitze im Bild:** Das legt die App selbst als Animation darüber. Sonst wäre es doppelt.
- **Morgen- und Abendrot** brauchen keine eigenen Bilder. Die App tönt dafür das Tagesbild warm ein.
- **Dateiname** genau wie angegeben, also z. B. `herbst-sonne.png`.
- **Übergeben:** die Bilder hier im Chat hochladen oder in diesen Ordner im Repository legen.
- **Pflicht** sind die 16 Bilder der vier Jahreszeiten. Die vier besonderen Wetterlagen sind ein Extra.

Die Prompts sind auf Englisch, weil die meisten Bildgeneratoren damit am zuverlässigsten arbeiten.

## Frühling

### 1. Frühling, sonnig – `fruehling-sonne`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Spring, mid-May, late morning. Clear blue sky with a few small white cumulus clouds, bright sunlight. Fresh light-green leaves, several blossoming fruit trees with white and pink blossoms, meadow full of dandelions and wildflowers.
```

### 2. Frühling, bewölkt – `fruehling-wolken`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Spring, May, overcast day. Uniform soft grey cloud cover, diffuse light without shadows. Fresh light-green leaves, a few blossoming fruit trees, meadow with dandelions. Calm, slightly muted colors.
```

### 3. Frühling, Regen – `fruehling-regen`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Spring, May, rainy day. Dark grey low rain clouds, wet glistening grass, puddles in the meadow, light mist over the forest. Do not show falling rain streaks or raindrops in the air.
```

### 4. Frühling, Nacht – `fruehling-nacht`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Spring, clear night. Starry sky with a crescent moon; the landscape is dimly lit by blue moonlight, blossoming trees faintly visible. Dark but not black, no light pollution.
```

## Sommer

### 5. Sommer, sonnig – `sommer-sonne`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Summer, July, early afternoon. Deep blue sky with a few fair-weather clouds, bright sunlight. Lush dark-green forest, a golden wheat field in the foreground with a few red poppies at its edge.
```

### 6. Sommer, bewölkt – `sommer-wolken`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Summer, July, overcast day. Thick grey-white cloud cover, soft light. Dark-green forest, ripening wheat field in the foreground.
```

### 7. Sommer, Regen – `sommer-regen`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Summer, July, rainy day. Heavy dark grey clouds, wet fields and trees in fresh green, low cloud wisps over the forest. Do not show falling rain streaks or raindrops in the air.
```

### 8. Sommer, Nacht – `sommer-nacht`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Summer, warm clear night. Starry sky with the Milky Way faintly visible and a half moon; the wheat field and the forest are faintly lit by moonlight. Dark but not black, no light pollution.
```

## Herbst

### 9. Herbst, sonnig – `herbst-sonne`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Autumn, mid-October, sunny afternoon. Clear blue sky, warm low sunlight. Colorful deciduous forest in red, orange, yellow and brown, mixed with dark-green spruces; meadow in the foreground with fallen colorful leaves.
```

### 10. Herbst, bewölkt – `herbst-wolken`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Autumn, October, overcast day. Grey cloud cover, soft diffuse light. Colorful autumn forest in red, orange and yellow, slightly muted; fallen leaves in the meadow.
```

### 11. Herbst, Regen – `herbst-regen`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Autumn, late October, rainy day. Dark heavy rain clouds, the colorful autumn forest glistening wet, wet fallen leaves and puddles in the meadow. Do not show falling rain streaks or raindrops in the air.
```

### 12. Herbst, Nacht – `herbst-nacht`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Autumn, clear cold night. Starry sky and a bright full moon; the colorful forest only faintly visible in silver moonlight, light ground mist over the meadow. Dark but not black, no light pollution.
```

## Winter

### 13. Winter, sonnig (ohne Schnee) – `winter-sonne`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Winter, January, sunny frosty day without snow. Pale blue sky, low winter sun, hoarfrost on the grass and on the bare branches of the deciduous trees, dark-green spruces.
```

### 14. Winter, bewölkt (ohne Schnee) – `winter-wolken`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Winter, January, grey overcast day without snow. Low grey cloud cover, bare deciduous trees, dark spruces, brownish-green dormant meadow, calm bleak mood.
```

### 15. Winter, Regen (ohne Schnee) – `winter-regen`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Winter, December, cold rainy day without snow. Dark grey clouds, wet bare trees, soggy brown-green meadow with puddles. Do not show falling rain streaks or raindrops in the air.
```

### 16. Winter, Nacht – `winter-nacht`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Winter, clear frosty night. Starry sky and moon; bare trees and spruces as silhouettes, frost on the meadow glinting in the moonlight. Dark but not black, no light pollution.
```

## Besondere Wetterlagen (optional)

### 17. Schnee – `winter-schnee`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Winter, deep fresh snow, bright overcast grey sky. Snow-covered spruces and bare trees, the meadow under a thick white blanket of snow. No falling snowflakes in the air.
```

### 18. Nebel – `herbst-nebel`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Autumn, foggy morning. Dense fog over the meadow, the colorful autumn forest fading into the fog, very soft light, almost white sky.
```

### 19. Gewitter – `sommer-gewitter`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Summer, approaching thunderstorm. Huge dark dramatic cumulonimbus clouds over the forest, eerie light, the field in the foreground lit by the last sunlight. No lightning bolt.
```

### 20. Hitze – `sommer-hitze`

```
Photorealistic landscape photo, vertical 9:16 portrait format. Rural Franconian countryside in southern Germany: gently rolling hills, a mixed forest of deciduous trees and spruces along the hills, meadows in the foreground. The horizon sits in the lower third of the image; the upper two thirds are open sky without distracting details. Eye-level viewpoint, 24 mm wide angle, natural colors, high detail. No people, no animals, no buildings, no roads, no text, no watermark, no frame. Midsummer heatwave, August, midday. Cloudless intensely blue sky, harsh bright sunlight, heat haze over a dry golden harvested field, slightly dried grass, dark-green forest.
```

## Welches Foto die App wann zeigt

| Wetterlage | Foto | wenn es fehlt |
|---|---|---|
| sonnig / heiter, Tag | `<jahreszeit>-sonne` | Zeichnung |
| bewölkt, Tag | `<jahreszeit>-wolken` | `-sonne` |
| Regen, Schneeregen, Hagel | `<jahreszeit>-regen` + Regenanimation | `-wolken` |
| Nacht (jedes Wetter) | `<jahreszeit>-nacht` + Wetteranimation | Zeichnung |
| Morgen- / Abendrot | Tagesbild mit warmer Tönung | |
| Schnee | `winter-schnee` + Schneefall (in jeder Jahreszeit) | `winter-wolken` |
| Nebel | `herbst-nebel` im Herbst, sonst `-wolken` + Nebelschleier | `-wolken` + Nebelschleier |
| Gewitter | `sommer-gewitter` im Sommer, sonst `-regen`, jeweils + Blitze | `-regen` + Blitze |
| Hitze ab 27 °C | `sommer-hitze` | `sommer-sonne` |
