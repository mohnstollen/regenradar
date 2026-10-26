package de.regenradar.wetter;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Regen-Benachrichtigung: Regen im eingestellten Umkreis, der den Standort laut DWD-Radarvorhersage erreicht –
 * mit Stärke, Zugrichtung und Ankunftszeit. Je Regengebiet eine Benachrichtigung, die bei ≤ 30 und ≤ 10 min
 * aktualisiert wird.
 */
final class RainAlert {
    // Stärke nach DWD/WMO in mm/h: leicht < 2,5, mäßig < 10, stark ab 10
    static final double MODERATE = 2.5, HEAVY = 10;
    private static final String[] FROM = { "Norden", "Nordosten", "Osten", "Südosten", "Süden", "Südwesten", "Westen", "Nordwesten" };
    private static final int MAX_SHIFT = 30;   // Suchbereich für die Zugbewegung: 30 km in 30 min (60 km/h)
    // rainStage: 0 = nichts, 1–3 = gemeldet (> 30 min, ≤ 30 min, ≤ 10 min), 9 = regnet am Standort
    private static final int RAINING = 9;

    private RainAlert() { }

    static final class Approach {
        long eta;        // Minuten bis zum Regen am Standort
        double mmh;      // stärkste Intensität in den ersten 30 min am Standort
        String from;     // Richtung, aus der der Regen kommt, z. B. "Südwesten"
    }

    /** Prüft und meldet; true = Regen ist im Anmarsch (dann öfter prüfen). */
    static boolean check(Context c, BrightSky.Radar r) {
        SharedPreferences p = Notifier.prefs(c);
        int stage = p.getInt("rainStage", 0);
        double radius = p.getInt("rainRadius", 10);
        String min = p.getString("rainMin", "all");
        long now = System.currentTimeMillis();

        if (r.maxNear(r.now, BrightSky.LOC_KM) >= BrightSky.RAIN_RAW) {   // regnet bereits
            if (stage != RAINING) { Notifier.cancel(c, "rain"); p.edit().putInt("rainStage", RAINING).apply(); }
            return false;
        }
        Approach a = analyze(r, radius, now);
        if (a == null || (min.equals("moderate") && a.mmh < MODERATE) || (min.equals("heavy") && a.mmh < HEAVY)) {
            if (stage != 0) {
                if (stage != RAINING) Notifier.cancel(c, "rain");   // Regen zieht doch nicht her
                p.edit().putInt("rainStage", 0).apply();
            }
            return false;
        }
        int next = a.eta > 30 ? 1 : a.eta > 10 ? 2 : 3;
        if (stage == RAINING) stage = a.eta > 30 ? 0 : RAINING;   // erst nach einer Regenpause neues Gebiet melden
        if (stage == RAINING || next <= stage) return true;
        String hhmm = BrightSky.hhmm(now + a.eta * BrightSky.MIN);
        Notifier.post(c, "rain", level(a.mmh) + " Regen in ca. " + a.eta + " min", text(a, hhmm), false);
        p.edit().putInt("rainStage", next).apply();
        return true;
    }

    static String level(double mmh) {
        return mmh >= HEAVY ? "Starker" : mmh >= MODERATE ? "Mäßiger" : "Leichter";
    }

    static String text(Approach a, String hhmm) {
        String when = a.eta <= 1 ? "in Kürze" : "in ca. " + a.eta + " min (" + hhmm + " Uhr)";
        return level(a.mmh) + " Regen " + (a.from != null ? "nähert sich aus " + a.from + " und erreicht Dich " : "erreicht Dich ") + when + ".";
    }

    /** Regen, der jetzt im Umkreis liegt und den Standort in der Vorhersage erreicht; sonst null. */
    static Approach analyze(BrightSky.Radar r, double radius, long now) {
        int arrive = -1;
        for (int i = r.now + 1; i < r.t.length && arrive < 0; i++)
            if (r.maxNear(i, BrightSky.LOC_KM) >= BrightSky.RAIN_RAW) arrive = i;
        if (arrive < 0 || r.maxNear(r.now, radius) < BrightSky.RAIN_RAW) return null;

        Approach a = new Approach();
        a.eta = Math.max(0, Math.round((r.t[arrive] - now) / (double) BrightSky.MIN));
        int peak = 0;
        for (int i = arrive; i < Math.min(r.t.length, arrive + 7); i++) peak = Math.max(peak, r.maxNear(i, BrightSky.LOC_KM));
        a.mmh = peak * 0.12;
        a.from = fromDirection(r, radius);
        return a;
    }

    /** Zugrichtung: Verschiebung der Regenfläche zwischen jetzt und +30 min (kleinste mittlere Abweichung). */
    static String fromDirection(BrightSky.Radar r, double radius) {
        int later = Math.min(r.t.length - 1, r.now + 6);
        if (later == r.now) return null;
        int[] A = r.f[r.now], B = r.f[later];
        int x0 = Math.max(0, (int) (r.px - radius)), x1 = Math.min(r.w - 1, (int) (r.px + radius));
        int y0 = Math.max(0, (int) (r.py - radius)), y1 = Math.min(r.h - 1, (int) (r.py + radius));
        int wet = 0;
        for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) if (A[y * r.w + x] >= BrightSky.RAIN_RAW && A[y * r.w + x] < 2500) wet++;
        if (wet < 4) return null;
        double best = Double.MAX_VALUE; int bx = 0, by = 0;
        for (int sy = -MAX_SHIFT; sy <= MAX_SHIFT; sy++)
            for (int sx = -MAX_SHIFT; sx <= MAX_SHIFT; sx++) {
                long sum = 0; int n = 0;
                for (int y = y0; y <= y1; y++) {
                    int yy = y + sy; if (yy < 0 || yy >= r.h) continue;
                    for (int x = x0; x <= x1; x++) {
                        int xx = x + sx; if (xx < 0 || xx >= r.w) continue;
                        int va = A[y * r.w + x], vb = B[yy * r.w + xx];
                        if (va >= 2500 || vb >= 2500) continue;
                        if ((va >= BrightSky.RAIN_RAW) != (vb >= BrightSky.RAIN_RAW)) sum += 100;   // Regenfläche vergleichen, nicht die Stärke
                        n++;
                    }
                }
                if (n < 20) continue;
                double score = (double) sum / n + 0.01 * (sx * sx + sy * sy);   // bei Gleichstand kleinere Bewegung bevorzugen
                if (score < best) { best = score; bx = sx; by = sy; }
            }
        if (bx * bx + by * by < 4) return null;   // kaum Bewegung (< 4 km/h)
        // Herkunft = Gegenrichtung der Bewegung; Gitter: x nach Osten, y nach Süden, um rot gegen Nord gedreht
        double bearing = Math.toDegrees(Math.atan2(-bx, by)) + r.rot;
        return FROM[(int) Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
    }
}
