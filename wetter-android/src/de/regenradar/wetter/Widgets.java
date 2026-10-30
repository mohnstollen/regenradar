package de.regenradar.wetter;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Startbildschirm-Widgets: klein (2×1, Symbol + Temperatur + Ort), breit (4×2, dazu Regen in 2 Stunden
 * und die nächsten Stunden) und groß (4×3, dazu DWD-Warnung und die nächsten 5 Tage). Die Daten holt CheckService; hier werden sie zwischengespeichert und gezeichnet,
 * damit die Widgets auch ohne Netz sofort etwas zeigen.
 */
final class Widgets {
    private static final String CACHE = "widgetData";
    private static final int SLOTS = 5, STEP_H = 2, DAYS = 5;
    private static final String[] WD = { "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa" };
    // Farben bei fest gewählter Darstellung; bei „Wie System“ gelten die Ressourcen (values / values-night)
    private static final int[] LIGHT = { 0xFF1C2733, 0xFF6B7A8C, 0xFF1F6FE0 }, DARK = { 0xFFE6EDF3, 0xFF93A1B0, 0xFF6EA8FF };
    private static final int[] HOUR_IDS = {
        R.id.h0_time, R.id.h0_icon, R.id.h0_temp, R.id.h0_prob, R.id.h1_time, R.id.h1_icon, R.id.h1_temp, R.id.h1_prob,
        R.id.h2_time, R.id.h2_icon, R.id.h2_temp, R.id.h2_prob, R.id.h3_time, R.id.h3_icon, R.id.h3_temp, R.id.h3_prob,
        R.id.h4_time, R.id.h4_icon, R.id.h4_temp, R.id.h4_prob };
    private static final int[] DAY_IDS = {
        R.id.d0_day, R.id.d0_icon, R.id.d0_hi, R.id.d0_lo, R.id.d0_mm, R.id.d1_day, R.id.d1_icon, R.id.d1_hi, R.id.d1_lo, R.id.d1_mm,
        R.id.d2_day, R.id.d2_icon, R.id.d2_hi, R.id.d2_lo, R.id.d2_mm, R.id.d3_day, R.id.d3_icon, R.id.d3_hi, R.id.d3_lo, R.id.d3_mm,
        R.id.d4_day, R.id.d4_icon, R.id.d4_hi, R.id.d4_lo, R.id.d4_mm };
    // Warnstufen wie .warn.* in style.css: Hintergrund (Drawable) und Schriftfarbe
    private static final Map<String, int[]> WARN = new HashMap<>();
    static {
        WARN.put("minor", new int[] { R.drawable.warn_minor, 0xFF4D4300 });
        WARN.put("moderate", new int[] { R.drawable.warn_moderate, 0xFF5A3000 });
        WARN.put("severe", new int[] { R.drawable.warn_severe, 0xFF5F0E0E });
        WARN.put("extreme", new int[] { R.drawable.warn_extreme, 0xFF3B0A47 });
        WARN.put("heat", new int[] { R.drawable.warn_heat, 0xFF5C1F00 });
    }

    private static final Map<String, String> ICON_TXT = new HashMap<>(), COND = new HashMap<>();
    static {   // wie ICON_TXT und COND in app.js
        String[] it = { "clear-day", "Sonnig", "clear-night", "Klar", "partly-cloudy-day", "Teilweise bewölkt", "partly-cloudy-night", "Teilweise bewölkt",
            "cloudy", "Bewölkt", "fog", "Nebel", "wind", "Windig", "rain", "Regen", "sleet", "Schneeregen", "snow", "Schnee", "hail", "Hagel", "thunderstorm", "Gewitter" };
        for (int i = 0; i < it.length; i += 2) ICON_TXT.put(it[i], it[i + 1]);
        String[] co = { "fog", "Nebel", "rain", "Regen", "sleet", "Schneeregen", "snow", "Schnee", "hail", "Hagel", "thunderstorm", "Gewitter" };
        for (int i = 0; i < co.length; i += 2) COND.put(co[i], co[i + 1]);
    }

    private Widgets() { }

    private static int[] ids(Context c, Class<?> cls) {
        return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, cls));
    }

    static boolean any(Context c) {
        return ids(c, WidgetSmall.class).length + ids(c, WidgetWide.class).length + ids(c, WidgetLarge.class).length + charts(c) > 0;
    }

    private static int charts(Context c) {
        return ids(c, WidgetChart.class).length + ids(c, WidgetChartPlus.class).length + ids(c, WidgetCombo.class).length;
    }

    private static final Class<?>[] ALL = { WidgetSmall.class, WidgetWide.class, WidgetLarge.class, WidgetChart.class, WidgetChartPlus.class, WidgetCombo.class };

    /** Ort eines Widgets: „gps“ (zuletzt per GPS), „app“ (in der App angezeigt, Standard für ältere Widgets) oder „fav:<id>“. */
    static final class Place {
        String key, name;
        double lat, lon;
    }

    /** Ort eines Widgets auflösen; fehlt GPS oder der Favorit, gilt der Ort aus der App. null = noch gar kein Ort. */
    static Place placeOf(Context c, int id) {
        SharedPreferences p = Notifier.prefs(c);
        String sel = p.getString("widgetLoc_" + id, "app");
        JSONObject o = null;
        try {
            if (sel.equals("gps")) o = new JSONObject(p.getString("gpsLoc", "null"));
            else if (sel.startsWith("fav:")) {
                JSONArray favs = new JSONArray(p.getString("favs", "[]"));
                for (int i = 0; i < favs.length(); i++)
                    if (sel.substring(4).equals(favs.getJSONObject(i).optString("id"))) o = favs.getJSONObject(i);
            }
        } catch (JSONException ignored) { }
        Place pl = new Place();
        if (o != null && o.has("lat")) {
            pl.lat = o.optDouble("lat"); pl.lon = o.optDouble("lon"); pl.name = o.optString("name", "");
        } else if (p.contains("lat")) {
            pl.lat = Double.longBitsToDouble(p.getLong("lat", 0)); pl.lon = Double.longBitsToDouble(p.getLong("lon", 0)); pl.name = p.getString("name", "");
        } else return null;
        pl.key = String.format(Locale.ROOT, "%.3f,%.3f", pl.lat, pl.lon);
        return pl;
    }

    /** Zeitraum eines Diagramm-Widgets in Stunden (12, 24 oder 48; Auswahl in WidgetConfig). */
    static int hours(Context c, int id) {
        return Notifier.prefs(c).getInt("chartHours_" + id, 12);
    }

    /** Was die Widgets an einem Ort brauchen. */
    private static final class Needs {
        boolean days, warn, rain; int hours;   // 5 Tage (groß), Warnung (groß/Kombi), Regen in 2 h (breit/groß), längster Diagrammzeitraum
    }

    /**
     * Alle Widgets aktualisieren: Daten je verwendetem Ort einmal holen. Für den Ort der App gibt CheckService den
     * Radar-Nowcast mit (appLat/appLon, nc); andere Orte holen ihn bei Bedarf selbst.
     */
    static void refreshAll(Context c, double appLat, double appLon, BrightSky.Nowcast appNc) {
        Map<String, Place> places = new HashMap<>();
        Map<String, Needs> needs = new HashMap<>();
        for (Class<?> k : ALL)
            for (int id : ids(c, k)) {
                Place pl = placeOf(c, id);
                if (pl == null) continue;
                places.put(pl.key, pl);
                Needs n = needs.get(pl.key);
                if (n == null) { n = new Needs(); needs.put(pl.key, n); }
                n.days |= k == WidgetLarge.class;
                n.warn |= k == WidgetLarge.class || k == WidgetCombo.class;
                n.rain |= k == WidgetWide.class || k == WidgetLarge.class;
                if (k == WidgetChart.class || k == WidgetChartPlus.class || k == WidgetCombo.class) n.hours = Math.max(n.hours, hours(c, id));
            }
        String appKey = String.format(Locale.ROOT, "%.3f,%.3f", appLat, appLon);
        for (Place pl : places.values()) {
            Needs n = needs.get(pl.key);
            BrightSky.Nowcast nc = null;
            if (pl.key.equals(appKey)) nc = appNc;
            else if (n.rain) { try { nc = BrightSky.nowcast(BrightSky.radar(pl.lat, pl.lon, 3)); } catch (Exception ignored) { } }
            refresh(c, pl, n, nc);
        }
        render(c);
    }

    // ---------- Daten ----------

    /** Holt aktuelle Werte und Vorhersage für einen Ort und speichert sie (je Ort ein Zwischenspeicher). */
    private static void refresh(Context c, Place pl, Needs n, BrightSky.Nowcast nc) {
        double lat = pl.lat, lon = pl.lon;
        JSONObject d = new JSONObject();
        long now = System.currentTimeMillis();
        try {
            JSONObject w = BrightSky.current(lat, lon);
            double t = w.optDouble("temperature", Double.NaN);
            String icon = w.optString("icon", "unknown"), cond = w.optString("condition", "");
            d.put("t", now).put("temp", t).put("icon", icon);
            String desc = COND.containsKey(cond) ? COND.get(cond) : ICON_TXT.containsKey(icon) ? ICON_TXT.get(icon) : "trocken";
            double feels = apparentTemp(t, w.optDouble("relative_humidity", Double.NaN), firstOf(w, "wind_speed_10", "wind_speed_30", "wind_speed_60"));
            if (!Double.isNaN(feels) && Math.abs(feels - t) >= 1) desc += " · gefühlt " + deg(feels);
            d.put("desc", desc);
        } catch (Exception e) {
            return;   // ohne aktuelle Werte alten Stand behalten
        }
        Map<Long, Double> probAt = new HashMap<>();   // Regenwahrscheinlichkeit aus MOSMIX, auch für die Diagramm-Widgets
        try {
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
            long dayStart = cal.getTimeInMillis();
            cal.add(Calendar.DAY_OF_MONTH, 1);
            long dayEnd = cal.getTimeInMillis();
            boolean large = n.days;
            cal.add(Calendar.DAY_OF_MONTH, DAYS + 1);
            long to = large ? cal.getTimeInMillis() : Math.max(dayEnd, now + (SLOTS * STEP_H + 2) * 3600000L);
            to = Math.max(to, now + (n.hours + 2) * 3600000L);   // Regenwahrscheinlichkeit für die Diagramme
            JSONArray rows = BrightSky.hourly(lat, lon, dayStart, to);
            probAt.clear();
            Map<Long, List<JSONObject>> byDay = new TreeMap<>();
            double hi = Double.NEGATIVE_INFINITY, lo = Double.POSITIVE_INFINITY;
            JSONArray hours = new JSONArray();
            long next = -1;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject r = rows.getJSONObject(i);
                long ts = BrightSky.parseIso(r.getString("timestamp"));
                double tt = r.optDouble("temperature", Double.NaN);
                if (!r.isNull("precipitation_probability")) probAt.put(ts, r.optDouble("precipitation_probability"));
                long day = startOfDay(ts - 1);   // Stundenwerte gelten für die Stunde davor (wie loadDays in app.js)
                if (large && day >= dayEnd) {
                    if (!byDay.containsKey(day)) byDay.put(day, new ArrayList<JSONObject>());
                    byDay.get(day).add(r.put("_t", ts));
                }
                if (ts > dayStart && ts <= dayEnd && !Double.isNaN(tt)) { hi = Math.max(hi, tt); lo = Math.min(lo, tt); }
                if (ts <= now || hours.length() >= SLOTS || (next > 0 && ts < next)) continue;
                hours.put(new JSONObject().put("t", ts).put("icon", r.optString("icon", "unknown")).put("temp", tt)
                    .put("prob", r.isNull("precipitation_probability") ? -1 : r.optInt("precipitation_probability", -1)));
                next = ts + STEP_H * 3600000L;
            }
            if (hi > lo) d.put("hi", hi).put("lo", lo);
            d.put("hours", hours);
            JSONArray days = new JSONArray();
            for (Map.Entry<Long, List<JSONObject>> e : byDay.entrySet()) {
                List<JSONObject> l = e.getValue();
                if (l.size() < 12 || days.length() >= DAYS) continue;
                double dh = Double.NEGATIVE_INFINITY, dl = Double.POSITIVE_INFINITY, mm = 0;
                for (JSONObject r : l) {
                    double tt = r.optDouble("temperature", Double.NaN);
                    if (!Double.isNaN(tt)) { dh = Math.max(dh, tt); dl = Math.min(dl, tt); }
                    mm += r.optDouble("precipitation", 0);
                }
                days.put(new JSONObject().put("t", e.getKey()).put("icon", dayIcon(l)).put("hi", dh).put("lo", dl).put("mm", mm));
            }
            d.put("days", days);
        } catch (Exception ignored) { }
        if (n.warn) {
            try { d.put("warn", topWarning(BrightSky.alerts(lat, lon))); } catch (Exception ignored) { }
        }
        if (n.hours > 0) {
            int mh = n.hours;
            try { chartData(d, "chart", "chartModel", lat, lon, probAt, now, Math.min(mh, 24), false); } catch (Exception ignored) { }
            if (mh > 24) try { chartData(d, "chart48", "chart48Model", lat, lon, probAt, now, 48, true); } catch (Exception ignored) { }
        }
        try { d.put("rain", rainText(nc)).put("rainNow", nc != null && (nc.raining || nc.eta >= 0)); } catch (JSONException ignored) { }
        Notifier.prefs(c).edit().putString(CACHE + "_" + pl.key, d.toString()).apply();
    }

    private static long startOfDay(long ms) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(ms);
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    // wie dayIcon() in app.js
    private static String dayIcon(List<JSONObject> list) {
        List<JSONObject> day = new ArrayList<>();
        Calendar cal = Calendar.getInstance();
        for (JSONObject r : list) { cal.setTimeInMillis(r.optLong("_t")); int h = cal.get(Calendar.HOUR_OF_DAY); if (h >= 7 && h <= 19) day.add(r); }
        List<JSONObject> L = day.isEmpty() ? list : day;
        double mm = 0;
        for (JSONObject r : list) mm += r.optDouble("precipitation", 0);
        if (count(L, "thunderstorm") >= 1) return "thunderstorm";
        if (mm >= 0.5) {
            if (count(L, "snow") >= 3) return "snow";
            if (count(L, "sleet") >= 3) return "sleet";
            int wet = 0;
            for (JSONObject r : L) if (r.optDouble("precipitation", 0) >= 0.1) wet++;
            return wet >= 5 ? "rain" : "showers";
        }
        if (count(L, "fog") >= 4) return "fog";
        double sum = 0; int n = 0;
        for (JSONObject r : L) if (!r.isNull("cloud_cover")) { sum += r.optDouble("cloud_cover", 0); n++; }
        if (n == 0) {
            String best = "clear-day";
            for (String k : new String[] { "partly-cloudy-day", "cloudy" }) if (count(L, k) > count(L, best)) best = k;
            return best;
        }
        double cl = sum / n;
        return cl < 25 ? "clear-day" : cl < 70 ? "partly-cloudy-day" : "cloudy";
    }

    private static int count(List<JSONObject> l, String icon) {
        int n = 0;
        for (JSONObject r : l) if (icon.equals(r.optString("icon"))) n++;
        return n;
    }

    /** Wichtigste Warnung (höchste Stufe, Hitze gesondert wie in app.js) mit Anzahl weiterer; null = keine. */
    private static JSONObject topWarning(JSONArray list) throws JSONException {
        JSONObject top = null; int topRank = -1;
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.getJSONObject(i);
            int rank = java.util.Arrays.asList("minor", "moderate", "severe", "extreme").indexOf(a.optString("severity"));
            if (rank > topRank) { topRank = rank; top = a; }
        }
        if (top == null) return null;
        String head = top.isNull("headline_de") ? top.optString("event_de", "Warnung") : top.optString("headline_de");
        boolean heat = (top.optString("event_de") + " " + head).toUpperCase(Locale.GERMANY).contains("HITZE");
        return new JSONObject().put("text", head + (list.length() > 1 ? " (+" + (list.length() - 1) + ")" : ""))
            .put("sev", heat ? "heat" : WARN.containsKey(top.optString("severity")) ? top.optString("severity") : "minor");
    }

    /**
     * Diagramm-Widgets: Temperatur, Sonne und Wind aus ICON-D2 (wie das Diagramm der App), Regenwahrscheinlichkeit aus
     * MOSMIX. Für 48 Stunden „ICON kombiniert“, weil ICON-D2 nur etwa 48 h ab Modellstart reicht.
     */
    private static void chartData(JSONObject d, String key, String modelKey, double lat, double lon, Map<Long, Double> probAt,
                                  long now, int hours, boolean seamless) throws Exception {
        JSONArray out;
        String model = seamless ? "ICON" : "ICON-D2";
        if (seamless) out = chartFrom(lat, lon, "icon_seamless", probAt, now, hours);
        else {
            try { out = chartFrom(lat, lon, "icon_d2", probAt, now, hours); }
            catch (Exception e) { out = chartFrom(lat, lon, "icon_seamless", probAt, now, hours); model = "ICON"; }   // außerhalb des ICON-D2-Gebiets
        }
        d.put(key, out).put(modelKey, model);
    }

    private static JSONArray chartFrom(double lat, double lon, String model, Map<Long, Double> probAt, long now, int hours) throws Exception {
        JSONObject h = BrightSky.getJSON(String.format(Locale.ROOT, "%s?latitude=%.4f&longitude=%.4f&hourly=temperature_2m,sunshine_duration,wind_speed_10m,wind_direction_10m&models=%s&timezone=auto&timeformat=unixtime&forecast_days=%d",
            DailyForecast.OM, lat, lon, model, hours > 24 ? 4 : 2)).getJSONObject("hourly");
        JSONArray time = h.getJSONArray("time"), temp = col(h, "temperature_2m", model), sun = col(h, "sunshine_duration", model),
            wind = col(h, "wind_speed_10m", model), dir = col(h, "wind_direction_10m", model);
        if (temp == null) throw new Exception("keine Daten");
        JSONArray out = new JSONArray();
        for (int i = 0; i < time.length(); i++) {
            long t = time.getLong(i) * 1000;
            if (t < now - 3 * 3600000L || t > now + (hours + 2) * 3600000L || temp.isNull(i)) continue;
            JSONObject o = new JSONObject().put("t", t).put("temp", temp.getDouble(i));
            if (sun != null && !sun.isNull(i)) o.put("sun", sun.getDouble(i) / 60);   // Sekunden → Minuten
            if (wind != null && !wind.isNull(i)) o.put("wind", wind.getDouble(i));
            if (dir != null && !dir.isNull(i)) o.put("dir", dir.getDouble(i));
            Double p = probAt.get(t);
            if (p != null) o.put("prob", p);
            out.put(o);
        }
        if (out.length() < 8) throw new Exception("keine Daten");
        return out;
    }

    private static JSONArray col(JSONObject h, String name, String model) {
        JSONArray a = h.optJSONArray(name);
        return a != null ? a : h.optJSONArray(name + "_" + model);
    }

    private static String rainText(BrightSky.Nowcast nc) {
        if (nc == null) return "";
        if (nc.raining) return nc.until >= 0 ? "Es regnet – vorbei in ca. " + nc.until + " min" : "Es regnet – hält über 2 Stunden an";
        if (nc.eta >= 0) return "Regen in ca. " + nc.eta + " min (gegen " + BrightSky.hhmm(System.currentTimeMillis() + nc.eta * BrightSky.MIN) + ")";
        return "Kein Regen in den nächsten 2 Stunden";
    }

    private static double firstOf(JSONObject o, String... keys) {
        for (String k : keys) if (!o.isNull(k)) return o.optDouble(k, Double.NaN);
        return Double.NaN;
    }

    // wie apparentTemp() in app.js
    private static double apparentTemp(double t, double rh, double windKmh) {
        if (Double.isNaN(t) || Double.isNaN(rh)) return Double.NaN;
        double e = rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t));
        return t + 0.33 * e - 0.70 * ((Double.isNaN(windKmh) ? 0 : windKmh) / 3.6) - 4.00;
    }

    private static String deg(double v) {
        return Double.isNaN(v) ? "–" : String.format(Locale.GERMANY, "%d°", Math.round(v));
    }

    // ---------- Zeichnen ----------

    static void render(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        for (int id : ids(c, WidgetSmall.class)) mgr.updateAppWidget(id, build(c, R.layout.widget_small, id));
        for (int id : ids(c, WidgetWide.class)) mgr.updateAppWidget(id, build(c, R.layout.widget_wide, id));
        for (int id : ids(c, WidgetLarge.class)) mgr.updateAppWidget(id, build(c, R.layout.widget_large, id));
        for (int id : ids(c, WidgetChart.class)) mgr.updateAppWidget(id, buildChart(c, mgr, id, 0));
        for (int id : ids(c, WidgetChartPlus.class)) mgr.updateAppWidget(id, buildChart(c, mgr, id, ChartImage.ROW_SUN | ChartImage.ROW_RAIN));
        for (int id : ids(c, WidgetCombo.class)) mgr.updateAppWidget(id, buildCombo(c, mgr, id));
    }

    private static boolean isDark(Context c, SharedPreferences p) {
        String theme = p.getString("theme", "system");
        return theme.equals("dark") || (theme.equals("system")
            && (c.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES);
    }

    /** Größe des Widgets in dp laut Launcher (im Hochformat Mindestbreite × Höchsthöhe). */
    private static int[] sizeDp(AppWidgetManager mgr, int id, int defW, int defH) {
        android.os.Bundle o = mgr.getAppWidgetOptions(id);
        int w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0), h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return new int[] { w > 0 ? w : defW, h > 0 ? h : defH };
    }

    /** Diagramm als Bitmap in wDp × hDp (höchstens ~2,5 MB – Grenze für RemoteViews). */
    private static android.graphics.Bitmap chartBitmap(Context c, JSONObject d, int hours, String place, int wDp, int hDp, int rows, boolean dark) {
        float dens = c.getResources().getDisplayMetrics().density;
        double maxPx = 2.5e6 / 4;
        if (wDp * hDp * dens * dens > maxPx) dens = (float) Math.sqrt(maxPx / (wDp * hDp));
        boolean long48 = hours > 24 && d.has("chart48");
        JSONArray data = long48 ? d.optJSONArray("chart48") : d.optJSONArray("chart");
        String stand = d.has("t") ? hours + " h · " + d.optString(long48 ? "chart48Model" : "chartModel", "ICON-D2") + " · " + BrightSky.hhmm(d.optLong("t")) : "";
        return ChartImage.draw(data, place, stand, Math.round(wDp * dens), Math.round(hDp * dens), dens, hours, rows, dark);
    }

    /** Zwischengespeicherte Daten für den Ort eines Widgets (leer, solange noch nichts geladen ist). */
    private static JSONObject cache(SharedPreferences p, Place pl) {
        if (pl == null) return new JSONObject();
        try { return new JSONObject(p.getString(CACHE + "_" + pl.key, "{}")); } catch (JSONException e) { return new JSONObject(); }
    }

    private static String placeName(Place pl) { return pl == null ? "Ort in der App wählen" : pl.name; }

    private static void openAppOnClick(Context c, RemoteViews v) {
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    }

    private static void setWarn(RemoteViews v, JSONObject w) {
        v.setViewVisibility(R.id.warn, w != null ? View.VISIBLE : View.GONE);
        if (w == null) return;
        int[] style = WARN.get(w.optString("sev", "minor"));
        v.setTextViewText(R.id.warn, w.optString("text"));
        v.setInt(R.id.warn, "setBackgroundResource", style[0]);
        v.setTextColor(R.id.warn, style[1]);
    }

    /**
     * Kombi-Widget: oben aktuelle Werte und Warnung (wie das breite Widget), darunter das Diagramm mit Sonne, Regen und Wind.
     * Die Höhe des Diagramms ergibt sich aus der Widgethöhe minus der festen Höhen in widget_combo.xml.
     */
    private static RemoteViews buildCombo(Context c, AppWidgetManager mgr, int id) {
        SharedPreferences p = Notifier.prefs(c);
        Place pl = placeOf(c, id);
        JSONObject d = cache(p, pl), w = d.optJSONObject("warn");
        boolean dark = isDark(c, p), hasLoc = pl != null;
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_combo);
        v.setTextViewText(R.id.place, placeName(pl));
        v.setTextViewText(R.id.temp, deg(d.optDouble("temp", Double.NaN)));
        v.setImageViewResource(R.id.icon, iconRes(c, d.optString("icon", "unknown")));
        v.setTextViewText(R.id.desc, d.optString("desc", hasLoc ? "Daten werden geladen …" : ""));
        v.setTextViewText(R.id.hilo, d.has("hi") ? "↑ " + deg(d.optDouble("hi")) + "  ↓ " + deg(d.optDouble("lo")) : "");
        v.setTextViewText(R.id.updated, d.has("t") ? "Stand " + BrightSky.hhmm(d.optLong("t")) : "");
        setWarn(v, w);
        int[] sz = sizeDp(mgr, id, 300, 230);
        // Kopf und Warnung wachsen mit der Systemschrift (Zeilenhöhe ≈ 1,2 × Schriftgröße); das Diagramm bekommt den Rest
        float fs = c.getResources().getConfiguration().fontScale;
        int headH = (int) Math.ceil(Math.max(46, Math.max((26 + 12) * fs * 1.2f + 2, (13 + 12 + 10) * fs * 1.2f + 5)));
        int warnH = (int) Math.ceil(Math.max(22, 12 * fs * 1.2f + 6)) + 5;
        int chartH = sz[1] - 8 - headH - (w != null ? warnH : 0) - 2 - 6;   // Polster oben, Kopf, Warnung, Abstand, Polster unten
        v.setImageViewBitmap(R.id.chart, chartBitmap(c, d, hours(c, id), null, sz[0], Math.max(90, chartH),
            ChartImage.ROW_SUN | ChartImage.ROW_RAIN | ChartImage.ROW_WIND, dark));
        if (theme(p) != null) {   // fest gewähltes Hell/Dunkel; sonst gelten die Ressourcenfarben
            int[] col = dark ? DARK : LIGHT;
            v.setInt(R.id.root, "setBackgroundResource", dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light);
            v.setTextColor(R.id.temp, col[0]); v.setTextColor(R.id.place, col[0]);
            v.setTextColor(R.id.desc, col[1]); v.setTextColor(R.id.hilo, col[1]); v.setTextColor(R.id.updated, col[1]);
        }
        openAppOnClick(c, v);
        return v;
    }

    private static String theme(SharedPreferences p) {
        String t = p.getString("theme", "system");
        return t.equals("light") || t.equals("dark") ? t : null;
    }

    /** Diagramm-Widget: Bild in der tatsächlichen Größe des Widgets, mit eigenem Kopf (Ort, Zeitraum, Modell, Stand). */
    private static RemoteViews buildChart(Context c, AppWidgetManager mgr, int id, int rows) {
        SharedPreferences p = Notifier.prefs(c);
        boolean dark = isDark(c, p);
        int[] sz = sizeDp(mgr, id, 300, rows != 0 ? 170 : 140);
        Place pl = placeOf(c, id);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_chart);
        v.setImageViewBitmap(R.id.chart, chartBitmap(c, cache(p, pl), hours(c, id), placeName(pl), sz[0], sz[1], rows, dark));
        v.setInt(R.id.root, "setBackgroundResource", dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light);
        openAppOnClick(c, v);
        return v;
    }

    private static RemoteViews build(Context c, int layout, int id) {
        SharedPreferences p = Notifier.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        boolean large = layout == R.layout.widget_large, wide = large || layout == R.layout.widget_wide;
        Place pl = placeOf(c, id);
        JSONObject d = cache(p, pl);
        v.setTextViewText(R.id.place, placeName(pl));
        v.setTextViewText(R.id.temp, deg(d.optDouble("temp", Double.NaN)));
        v.setImageViewResource(R.id.icon, iconRes(c, d.optString("icon", "unknown")));
        if (wide) {
            v.setTextViewText(R.id.desc, d.optString("desc", pl != null ? "Daten werden geladen …" : ""));
            v.setTextViewText(R.id.hilo, d.has("hi") ? "↑ " + deg(d.optDouble("hi")) + "  ↓ " + deg(d.optDouble("lo")) : "");
            v.setTextViewText(R.id.updated, d.has("t") ? "Stand " + BrightSky.hhmm(d.optLong("t")) : "");
            String rain = d.optString("rain", "");
            boolean rainNow = d.optBoolean("rainNow");
            v.setTextViewText(R.id.rain_on, rain);
            v.setTextViewText(R.id.rain_off, rain);
            v.setViewVisibility(R.id.rain_on, !rain.isEmpty() && rainNow ? View.VISIBLE : View.GONE);
            v.setViewVisibility(R.id.rain_off, !rain.isEmpty() && !rainNow ? View.VISIBLE : View.GONE);
            JSONArray hours = d.optJSONArray("hours");
            for (int i = 0; i < SLOTS; i++) {
                JSONObject h = hours != null ? hours.optJSONObject(i) : null;
                int base = i * 4;
                v.setViewVisibility(HOUR_IDS[base + 1], h != null ? View.VISIBLE : View.INVISIBLE);
                v.setTextViewText(HOUR_IDS[base], h != null ? BrightSky.hhmm(h.optLong("t")) : "");
                if (h != null) v.setImageViewResource(HOUR_IDS[base + 1], iconRes(c, h.optString("icon", "unknown")));
                v.setTextViewText(HOUR_IDS[base + 2], h != null ? deg(h.optDouble("temp", Double.NaN)) : "");
                int prob = h != null ? h.optInt("prob", -1) : -1;
                v.setTextViewText(HOUR_IDS[base + 3], prob >= 10 ? prob + " %" : "");
            }
        }
        if (large) {
            setWarn(v, d.optJSONObject("warn"));
            JSONArray days = d.optJSONArray("days");
            Calendar cal = Calendar.getInstance();
            for (int i = 0; i < DAYS; i++) {
                JSONObject x = days != null ? days.optJSONObject(i) : null;
                int base = i * 5;
                v.setViewVisibility(DAY_IDS[base + 1], x != null ? View.VISIBLE : View.INVISIBLE);
                String label = "";
                if (x != null) {
                    cal.setTimeInMillis(x.optLong("t"));
                    label = WD[cal.get(Calendar.DAY_OF_WEEK) - 1] + " " + cal.get(Calendar.DAY_OF_MONTH) + ".";
                    v.setImageViewResource(DAY_IDS[base + 1], iconRes(c, x.optString("icon", "unknown")));
                }
                v.setTextViewText(DAY_IDS[base], label);
                v.setTextViewText(DAY_IDS[base + 2], x != null ? deg(x.optDouble("hi", Double.NaN)) : "");
                v.setTextViewText(DAY_IDS[base + 3], x != null ? deg(x.optDouble("lo", Double.NaN)) : "");
                double mm = x != null ? x.optDouble("mm", 0) : 0;
                v.setTextViewText(DAY_IDS[base + 4], mm >= 0.5 ? String.format(Locale.GERMANY, mm < 10 ? "%.1f mm" : "%.0f mm", mm) : "");
            }
        }
        applyTheme(c, v, p.getString("theme", "system"), wide, large);

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    /** Fest gewähltes Hell/Dunkel aus der App übernehmen; bei „Wie System“ bleiben die Ressourcenfarben (folgen dem Systemmodus). */
    private static void applyTheme(Context c, RemoteViews v, String theme, boolean wide, boolean large) {
        if (!theme.equals("light") && !theme.equals("dark")) return;
        boolean dark = theme.equals("dark");
        int[] col = dark ? DARK : LIGHT;
        v.setInt(R.id.root, "setBackgroundResource", dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light);
        v.setTextColor(R.id.temp, col[0]);
        v.setTextColor(R.id.place, wide ? col[0] : col[1]);
        if (!wide) return;
        v.setTextColor(R.id.desc, col[1]);
        v.setTextColor(R.id.hilo, col[1]);
        v.setTextColor(R.id.updated, col[1]);
        v.setTextColor(R.id.rain_on, col[2]);
        v.setTextColor(R.id.rain_off, col[1]);
        for (int i = 0; i < SLOTS; i++) {
            v.setTextColor(HOUR_IDS[i * 4], col[1]);
            v.setTextColor(HOUR_IDS[i * 4 + 2], col[0]);
            v.setTextColor(HOUR_IDS[i * 4 + 3], col[2]);
        }
        if (!large) return;
        v.setInt(R.id.divider, "setBackgroundColor", dark ? 0x33E6EDF3 : 0x1F1C2733);
        for (int i = 0; i < DAYS; i++) {
            v.setTextColor(DAY_IDS[i * 5], col[1]);
            v.setTextColor(DAY_IDS[i * 5 + 2], col[0]);
            v.setTextColor(DAY_IDS[i * 5 + 3], col[1]);
            v.setTextColor(DAY_IDS[i * 5 + 4], col[2]);
        }
    }

    private static int iconRes(Context c, String key) {
        int id = c.getResources().getIdentifier("wx_" + key.replace('-', '_'), "drawable", c.getPackageName());
        return id != 0 ? id : R.drawable.wx_unknown;
    }
}
