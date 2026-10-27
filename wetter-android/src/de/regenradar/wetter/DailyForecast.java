package de.regenradar.wetter;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Tagesvorhersage als Benachrichtigung (abends für morgen, morgens für heute): Textprognose und Winterhinweise aus
 * DWD ICON-D2 (Open-Meteo), dazu DWD-Warnungen für den Tag. Die Texte entstehen genau wie buildDayText() und
 * buildWinter() in app.js – Änderungen dort bitte hier nachziehen (der Vergleichstest prüft Wort für Wort).
 */
final class DailyForecast {
    static final String OM = "https://api.open-meteo.com/v1/forecast";
    private static final long HOUR = 3600000L;
    private static final String VARS = "temperature_2m,dew_point_2m,precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,snowfall_height,freezing_level_height";
    private static final String[] WD_LONG = { "Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag" };
    private static final String[] WD = { "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa" };

    private DailyForecast() { }

    /** Stundenwert wie die rows in app.js; NaN bzw. Integer.MIN_VALUE = fehlt. */
    static final class Row {
        long t;
        double temp, dew = Double.NaN, mm, snow, cloud = Double.NaN, wind = Double.NaN, gust = Double.NaN, snowH = Double.NaN, frzH = Double.NaN;
        int code = Integer.MIN_VALUE;
    }

    static final class Data { List<Row> rows = new ArrayList<>(); double elevation = Double.NaN; }

    /** Meldung abschicken. evening = true: Vorhersage für morgen, sonst für heute. */
    static void run(Context c, boolean evening) throws Exception {
        SharedPreferences p = Notifier.prefs(c);
        if (!p.contains("dailyLat")) return;
        double lat = Double.longBitsToDouble(p.getLong("dailyLat", 0)), lon = Double.longBitsToDouble(p.getLong("dailyLon", 0));
        String place = p.getString("dailyName", "");
        long now = System.currentTimeMillis();
        Data d;
        try { d = fetch(lat, lon, "icon_d2"); }
        catch (Exception e) { d = fetch(lat, lon, "icon_seamless"); }   // außerhalb des ICON-D2-Gebiets
        String[] out = dayText(d.rows, now, evening);
        if (out == null) return;
        StringBuilder body = new StringBuilder(out[0]);
        for (String w : winter(d.rows, d.elevation, now)) body.append('\n').append(w);
        try {
            for (String w : warnings(BrightSky.alerts(lat, lon), addDays(dayStart(now), evening ? 1 : 0))) body.append("\n⚠ ").append(w);
        } catch (Exception ignored) { }
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(addDays(dayStart(now), evening ? 1 : 0));
        String title = (evening ? "Morgen, " : "Heute, ") + WD_LONG[cal.get(Calendar.DAY_OF_WEEK) - 1] + (place.isEmpty() ? "" : " – " + place);
        Notifier.post(c, evening ? "daily-eve" : "daily-morn", title, body.toString(), Notifier.CH_DAILY);
    }

    static Data fetch(double lat, double lon, String model) throws Exception {
        JSONObject j = BrightSky.getJSON(String.format(Locale.ROOT, "%s?latitude=%.4f&longitude=%.4f&hourly=%s&models=%s&timezone=auto&timeformat=unixtime&forecast_days=3",
            OM, lat, lon, VARS, model));
        JSONObject h = j.getJSONObject("hourly");
        JSONArray time = h.getJSONArray("time");
        Data d = new Data();
        d.elevation = j.optDouble("elevation", Double.NaN);
        for (int i = 0; i < time.length(); i++) {
            Row r = new Row();
            r.t = time.getLong(i) * 1000;
            r.temp = num(h, "temperature_2m", model, i);
            if (Double.isNaN(r.temp)) continue;
            r.dew = num(h, "dew_point_2m", model, i);
            r.mm = nz(num(h, "precipitation", model, i));
            r.snow = nz(num(h, "snowfall", model, i));
            double code = num(h, "weather_code", model, i);
            r.code = Double.isNaN(code) ? Integer.MIN_VALUE : (int) code;
            r.cloud = num(h, "cloud_cover", model, i);
            r.wind = num(h, "wind_speed_10m", model, i);
            r.gust = num(h, "wind_gusts_10m", model, i);
            r.snowH = num(h, "snowfall_height", model, i);
            r.frzH = num(h, "freezing_level_height", model, i);
            d.rows.add(r);
        }
        if (d.rows.size() < 12) throw new Exception("keine Daten");
        return d;
    }

    private static double num(JSONObject h, String name, String model, int i) {
        JSONArray a = h.optJSONArray(name);
        if (a == null) a = h.optJSONArray(name + "_" + model);
        return a == null || i >= a.length() || a.isNull(i) ? Double.NaN : a.optDouble(i, Double.NaN);
    }

    private static double nz(double v) { return Double.isNaN(v) ? 0 : v; }

    // ---------- wie buildDayText() in app.js ----------

    private static final class Period {
        char k; List<Row> list = new ArrayList<>(); double mm, cloud, wind, gust, tmax, tmin; List<Integer> codes = new ArrayList<>();
        boolean fog; String wet, key;
    }

    /** {Text, Symbol} oder null. */
    static String[] dayText(List<Row> rows, long now, boolean tomorrow) {
        long base = addDays(dayStart(now), tomorrow ? 1 : 0);
        String word = tomorrow ? "Morgen" : "Heute";
        char[] K = { 'V', 'N', 'A' };
        int[][] AB = { { 6, 12 }, { 12, 18 }, { 18, 24 } };
        List<Period> periods = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            long from = Math.max(base + AB[i][0] * HOUR, tomorrow ? 0 : now), to = base + AB[i][1] * HOUR;
            Period p = new Period();
            p.k = K[i];
            for (Row r : rows) if (r.t > from && r.t <= to) p.list.add(r);
            if (p.list.size() < 2) continue;
            double cs = 0, ws = 0; int cn = 0, wn = 0;
            p.gust = 0; p.tmax = Double.NEGATIVE_INFINITY; p.tmin = Double.POSITIVE_INFINITY;
            for (Row r : p.list) {
                p.mm += r.mm;
                if (!Double.isNaN(r.cloud)) { cs += r.cloud; cn++; }
                if (!Double.isNaN(r.wind)) { ws += r.wind; wn++; }
                p.gust = Math.max(p.gust, Double.isNaN(r.gust) ? 0 : r.gust);
                if (r.code != Integer.MIN_VALUE) p.codes.add(r.code);
                p.tmax = Math.max(p.tmax, r.temp); p.tmin = Math.min(p.tmin, r.temp);
            }
            p.cloud = cn > 0 ? cs / cn : Double.NaN;
            p.wind = wn > 0 ? ws / wn : Double.NaN;
            int fogN = 0;
            for (int c : p.codes) if (c == 45 || c == 48) fogN++;
            p.fog = fogN >= p.list.size() / 2.0;
            periods.add(p);
        }
        if (periods.isEmpty()) return null;
        boolean anyWet = false;
        for (Period p : periods) { p.wet = wetType(p); anyWet |= p.wet != null; }
        for (Period p : periods) p.key = skyCls(p) + "|" + p.wet;
        List<String> segK = new ArrayList<>(), segDesc = new ArrayList<>();
        List<Period> segP = new ArrayList<>();
        for (Period p : periods) {
            int last = segK.size() - 1;
            if (last >= 0 && segP.get(last).key.equals(p.key)) segK.set(last, segK.get(last) + p.k);
            else { segK.add(String.valueOf(p.k)); segP.add(p); }
        }
        String[] SKY_DAY = { "sonnig", "heiter", "wolkig", "bedeckt", "neblig" }, SKY_NIGHT = { "klar", "überwiegend klar", "wolkig", "bedeckt", "neblig" };
        for (int i = 0; i < segK.size(); i++) {
            Period p = segP.get(i);
            int c = skyCls(p);
            String w = segK.get(i).equals("A") ? SKY_NIGHT[c] : SKY_DAY[c];
            segDesc.add(p.wet != null ? w + " " + wetText(p.wet) : anyWet ? w + " und trocken" : w);
        }
        StringBuilder text = new StringBuilder();
        if (segK.size() == 1) text.append(word).append(' ').append(segDesc.get(0));
        else {
            text.append(word).append(first(segK.get(0))).append(' ').append(segDesc.get(0));
            for (int i = 1; i < segK.size(); i++) text.append(", ").append(next(segK.get(i))).append(' ').append(segDesc.get(i));
        }
        Period f = periods.get(0), l = periods.get(periods.size() - 1);
        double fw = nz(f.wind), lw = nz(l.wind), maxWind = 0;   // fehlender Wind zählt wie in JS als 0
        for (Period p : periods) maxWind = Math.max(maxWind, nz(p.wind));
        if (periods.size() > 1 && lw - fw >= 8 && lw >= 15) text.append(" bei auffrischendem Wind");
        else if (periods.size() > 1 && fw - lw >= 8 && fw >= 15) text.append(" bei nachlassendem Wind");
        else if (maxWind >= 30) text.append(" bei kräftigem Wind");
        text.append('.');
        if (!anyWet) text.append(" Es bleibt trocken.");
        double gmax = Double.NEGATIVE_INFINITY;
        for (Period p : periods) gmax = Math.max(gmax, p.gust);
        if (gmax >= 75) text.append(" Sturmböen bis ").append(fmt0(gmax)).append(" km/h.");
        else if (gmax >= 60) text.append(" Stürmische Böen bis ").append(fmt0(gmax)).append(" km/h.");
        else if (gmax >= 45) text.append(" Windböen bis ").append(fmt0(gmax)).append(" km/h.");
        double dayMax = Double.NEGATIVE_INFINITY; boolean hasDay = false;
        for (Period p : periods) if (p.k != 'A') { hasDay = true; dayMax = Math.max(dayMax, p.tmax); }
        if (hasDay) text.append(" Höchstwert ").append(fmt0(dayMax)).append(" °C");
        else text.append(" Temperaturen um ").append(fmt0((l.tmax + l.tmin) / 2)).append(" °C");
        long n0 = addDays(base, 1);
        double nmin = Double.POSITIVE_INFINITY; int nn = 0;
        for (Row r : rows) if (r.t > n0 && r.t <= n0 + 7 * HOUR) { nn++; nmin = Math.min(nmin, r.temp); }
        if (nn >= 3) text.append(", in der Nacht ").append(fmt0(nmin)).append(" °C");
        text.append('.');
        Period main = null;
        for (Period p : periods) if (p.wet != null && (main == null || p.mm > main.mm)) main = p;
        if (main == null) for (Period p : periods) if (p.k == 'N') { main = p; break; }
        if (main == null) main = periods.get(0);
        double mc = Double.isNaN(main.cloud) ? 50 : main.cloud;
        String icon = main.wet != null ? iconOf(main.wet) : main.fog ? "fog" : mc < 20 ? (main.k == 'A' ? "clear-night" : "clear-day")
            : mc < 75 ? (main.k == 'A' ? "partly-cloudy-night" : "partly-cloudy-day") : "cloudy";
        return new String[] { text.toString().replaceAll("\\s+", " ").trim(), icon };
    }

    private static String wetType(Period p) {
        boolean thunder = false, snow = false, freezing = false, shower = false, rain = false, drizzle = false;
        for (int c : p.codes) {
            thunder |= c >= 95;
            snow |= (c >= 71 && c <= 77) || c == 85 || c == 86;
            freezing |= c == 56 || c == 57 || c == 66 || c == 67;
            shower |= c >= 80 && c <= 82;
            rain |= c >= 61 && c <= 65;
            drizzle |= c >= 51 && c <= 55;
        }
        if (thunder) return "thunder";
        if (p.mm < 0.2) return null;
        if (snow) return "snow";
        if (freezing) return "freezing";
        if (shower) return "shower";
        if (rain) return p.mm / p.list.size() >= 0.8 ? "heavy" : "rain";
        if (drizzle) return "drizzle";
        return "rain";
    }

    private static String wetText(String w) {
        switch (w) {
            case "thunder": return "mit Gewittern";
            case "snow": return "mit Schneefall";
            case "freezing": return "mit gefrierendem Regen (Glättegefahr)";
            case "shower": return "mit Schauern";
            case "heavy": return "mit kräftigem Regen";
            case "drizzle": return "mit Nieselregen";
            default: return "mit Regen";
        }
    }

    private static String iconOf(String w) {
        switch (w) {
            case "thunder": return "thunderstorm";
            case "snow": return "snow";
            case "freezing": return "sleet";
            case "shower": return "showers";
            default: return "rain";
        }
    }

    private static int skyCls(Period p) {
        double c = Double.isNaN(p.cloud) ? 50 : p.cloud;
        return p.fog ? 4 : c < 20 ? 0 : c < 45 ? 1 : c < 75 ? 2 : 3;
    }

    private static String first(String k) {
        switch (k) {
            case "V": return " Vormittag";
            case "N": return " Nachmittag";
            case "A": return " Abend";
            case "VN": return " tagsüber";
            case "NA": return " ab dem Nachmittag";
            default: return "";
        }
    }

    private static String next(String k) {
        switch (k) {
            case "N": return "am Nachmittag";
            case "A": return "am Abend";
            case "NA": return "ab dem Nachmittag";
            default: return "";
        }
    }

    // ---------- wie buildWinter() in app.js ----------

    static List<String> winter(List<Row> rows, double elev, long now) {
        List<Row> win = new ArrayList<>();
        for (Row r : rows) if (r.t > now && r.t <= now + 30 * HOUR) win.add(r);
        List<String> out = new ArrayList<>();
        if (win.isEmpty()) return out;
        boolean hasElev = !Double.isNaN(elev);
        long elevR = hasElev ? Math.round(elev / 10) * 10 : 0;
        // Schneefallgrenze – nur wenn Niederschlag erwartet wird
        int wetN = 0; double shMin = Double.POSITIVE_INFINITY, shMax = Double.NEGATIVE_INFINITY; int shN = 0;
        for (Row r : win) {
            if (r.mm < 0.1) continue;
            wetN++;
            double sh = !Double.isNaN(r.snowH) ? r.snowH : !Double.isNaN(r.frzH) ? r.frzH - 300 : Double.NaN;
            if (!Double.isNaN(sh)) { shN++; shMin = Math.min(shMin, sh); shMax = Math.max(shMax, sh); }
        }
        if (wetN > 0 && shN > 0 && shMin < 1500) {
            long lo = round100(shMin), hi = round100(shMax);
            String t = "Schneefallgrenze " + (lo == hi ? "um " + lo : "zwischen " + lo + " und " + hi) + " m";
            if (hasElev) {
                t += " (Standort " + elevR + " m)";
                t += lo <= elevR ? " – Schnee bzw. Schneeregen bis in den Ort" : lo <= elevR + 300 ? " – Schnee knapp oberhalb des Ortes, im Ort Regen oder Schneeregen" : " – im Ort Regen";
            }
            out.add(t + ".");
        }
        // Glätte
        List<long[]> hz = new ArrayList<>();   // {Zeit, Grund-Index}
        String[] WHY = { "gefrierenden Regen (Glatteis)", "Schnee", "überfrierende Nässe", "Reif" };
        Long tFrz = null, tSnow = null, tWet = null, tRime = null;
        for (Row r : win) {
            if (tFrz == null && (r.code == 56 || r.code == 57 || r.code == 66 || r.code == 67)) tFrz = r.t;
            boolean snowCode = (r.code >= 71 && r.code <= 77) || r.code == 85 || r.code == 86;
            if (tSnow == null && (r.snow > 0 || snowCode) && r.temp <= 1.5) tSnow = r.t;
            if (tWet == null && r.temp <= 0) {
                for (Row q : rows)
                    if (q.t > now - 6 * HOUR && q.t <= now + 30 * HOUR && q.t < r.t && q.t >= r.t - 6 * HOUR && q.mm >= 0.1 && q.temp > 0) { tWet = r.t; break; }
            }
            if (tRime == null && r.temp <= 0 && !Double.isNaN(r.dew) && r.temp - r.dew <= 1.5 && r.mm < 0.1) tRime = r.t;
        }
        Long[] ts = { tFrz, tSnow, tWet, tRime };
        for (int i = 0; i < 4; i++) if (ts[i] != null) hz.add(new long[] { ts[i], i });
        if (!hz.isEmpty()) {
            Collections.sort(hz, new Comparator<long[]>() {   // stabil, wie sort() in JS
                @Override public int compare(long[] a, long[] b) { return Long.compare(a[0], b[0]); }
            });
            StringBuilder why = new StringBuilder();
            List<String> seen = new ArrayList<>();
            for (long[] h : hz) {
                String w = WHY[(int) h[1]];
                if (seen.contains(w)) continue;
                why.append(seen.isEmpty() ? "" : ", ").append(w);
                seen.add(w);
            }
            out.add("Glättegefahr ab " + hourTxt(hz.get(0)[0], now) + " durch " + why + ".");
        }
        // Frost
        double tmin = Double.POSITIVE_INFINITY;
        for (Row r : win) tmin = Math.min(tmin, r.temp);
        if (tmin <= 0) {
            long tm = 0, t0f = 0;
            for (Row r : win) if (r.temp == tmin) { tm = r.t; break; }
            for (Row r : win) if (r.temp <= 0) { t0f = r.t; break; }
            out.add("Frost ab " + hourTxt(t0f, now) + ", Tiefstwert " + fmt0(tmin) + " °C gegen " + hourTxt(tm, now) + ".");
        } else if (tmin <= 3) {
            out.add("Bodenfrost möglich – Tiefstwert in 2 m Höhe " + fmt0(tmin) + " °C.");
        }
        return out;
    }

    private static long round100(double v) { return Math.max(0, Math.round(v / 100) * 100); }

    // ---------- DWD-Warnungen für den Tag ----------

    /** Warnungen, die am Tag ab dayStart gelten, wichtigste zuerst: „Überschrift (Mi 10:00 – Do 06:00 Uhr)“. */
    static List<String> warnings(JSONArray alerts, long day) {
        long end = addDays(day, 1);
        List<Object[]> hits = new ArrayList<>();
        List<String> sev = Arrays.asList("minor", "moderate", "severe", "extreme");
        for (int i = 0; i < alerts.length(); i++) {
            JSONObject a = alerts.optJSONObject(i);
            if (a == null) continue;
            long on, off;
            try {
                on = a.isNull("onset") ? 0 : BrightSky.parseIso(a.getString("onset"));
                off = a.isNull("expires") ? Long.MAX_VALUE : BrightSky.parseIso(a.getString("expires"));
            } catch (Exception e) { continue; }
            if (on >= end || off <= day) continue;
            String head = a.optString("headline_de", "");
            if (head.isEmpty() || head.equals("null")) head = a.optString("event_de", "Warnung");
            boolean sameDay = on > 0 && off != Long.MAX_VALUE && dayStart(on) == dayStart(off - 1);
            String when = on > 0 ? whenTxt(on) + (off != Long.MAX_VALUE ? " – " + (sameDay ? BrightSky.hhmm(off) : whenTxt(off)) : "")
                : off != Long.MAX_VALUE ? "bis " + whenTxt(off) : "";
            hits.add(new Object[] { sev.indexOf(a.optString("severity")), head + (when.isEmpty() ? "" : " (" + when + " Uhr)") });
        }
        Collections.sort(hits, new Comparator<Object[]>() {
            @Override public int compare(Object[] x, Object[] y) { return Integer.compare((int) y[0], (int) x[0]); }
        });
        List<String> out = new ArrayList<>();
        for (Object[] h : hits) if (!out.contains((String) h[1])) out.add((String) h[1]);
        return out;
    }

    private static String whenTxt(long t) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(t);
        return WD[cal.get(Calendar.DAY_OF_WEEK) - 1] + " " + BrightSky.hhmm(t);
    }

    // ---------- Hilfen wie in app.js ----------

    static long dayStart(long t) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(t);
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    static long addDays(long t, int n) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(t);
        cal.add(Calendar.DAY_OF_MONTH, n);
        return cal.getTimeInMillis();
    }

    // wie hourTxt() in app.js
    private static String hourTxt(long ms, long now) {
        long today = dayStart(now), d = dayStart(ms);
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(ms);
        int h = cal.get(Calendar.HOUR_OF_DAY);
        if (d == today) return h + " Uhr";
        if (d == addDays(today, 1)) return h < 6 ? h + " Uhr in der Nacht" : "morgen " + h + " Uhr";
        return WD[cal.get(Calendar.DAY_OF_WEEK) - 1] + " " + h + " Uhr";
    }

    // wie fmt(v, 0) in app.js (toLocaleString de-DE: kaufmännisch gerundet, „-0“ bleibt erhalten)
    static String fmt0(double v) {
        if (Double.isNaN(v)) return "–";
        long r = Math.round(Math.abs(v));
        String s = (v < 0 ? "-" : "") + r;
        return r >= 1000 ? s.replaceFirst("(\\d)(\\d{3})$", "$1.$2") : s;
    }
}
