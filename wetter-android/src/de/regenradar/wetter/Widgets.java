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

import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Startbildschirm-Widgets: klein (2×1, Symbol + Temperatur + Ort) und breit (4×2, dazu Regen in 2 Stunden
 * und die nächsten Stunden). Die Daten holt CheckService; hier werden sie zwischengespeichert und gezeichnet,
 * damit die Widgets auch ohne Netz sofort etwas zeigen.
 */
final class Widgets {
    private static final String CACHE = "widgetData";
    private static final int SLOTS = 5, STEP_H = 2;
    // Farben bei fest gewählter Darstellung; bei „Wie System“ gelten die Ressourcen (values / values-night)
    private static final int[] LIGHT = { 0xFF1C2733, 0xFF6B7A8C, 0xFF1F6FE0 }, DARK = { 0xFFE6EDF3, 0xFF93A1B0, 0xFF6EA8FF };
    private static final int[] HOUR_IDS = {
        R.id.h0_time, R.id.h0_icon, R.id.h0_temp, R.id.h0_prob, R.id.h1_time, R.id.h1_icon, R.id.h1_temp, R.id.h1_prob,
        R.id.h2_time, R.id.h2_icon, R.id.h2_temp, R.id.h2_prob, R.id.h3_time, R.id.h3_icon, R.id.h3_temp, R.id.h3_prob,
        R.id.h4_time, R.id.h4_icon, R.id.h4_temp, R.id.h4_prob };

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
        return ids(c, WidgetSmall.class).length + ids(c, WidgetWide.class).length > 0;
    }

    // ---------- Daten ----------

    /** Holt aktuelle Werte und Stundenvorhersage, speichert sie und zeichnet alle Widgets neu. */
    static void refresh(Context c, double lat, double lon, BrightSky.Nowcast nc) {
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
        try {
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
            long dayStart = cal.getTimeInMillis();
            cal.add(Calendar.DAY_OF_MONTH, 1);
            long dayEnd = cal.getTimeInMillis();
            JSONArray rows = BrightSky.hourly(lat, lon, dayStart, Math.max(dayEnd, now + (SLOTS * STEP_H + 2) * 3600000L));
            double hi = Double.NEGATIVE_INFINITY, lo = Double.POSITIVE_INFINITY;
            JSONArray hours = new JSONArray();
            long next = -1;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject r = rows.getJSONObject(i);
                long ts = BrightSky.parseIso(r.getString("timestamp"));
                double tt = r.optDouble("temperature", Double.NaN);
                if (ts > dayStart && ts <= dayEnd && !Double.isNaN(tt)) { hi = Math.max(hi, tt); lo = Math.min(lo, tt); }
                if (ts <= now || hours.length() >= SLOTS || (next > 0 && ts < next)) continue;
                hours.put(new JSONObject().put("t", ts).put("icon", r.optString("icon", "unknown")).put("temp", tt)
                    .put("prob", r.isNull("precipitation_probability") ? -1 : r.optInt("precipitation_probability", -1)));
                next = ts + STEP_H * 3600000L;
            }
            if (hi > lo) d.put("hi", hi).put("lo", lo);
            d.put("hours", hours);
        } catch (Exception ignored) { }
        try { d.put("rain", rainText(nc)).put("rainNow", nc != null && (nc.raining || nc.eta >= 0)); } catch (JSONException ignored) { }
        Notifier.prefs(c).edit().putString(CACHE, d.toString()).apply();
        render(c);
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
        int[] small = ids(c, WidgetSmall.class), wide = ids(c, WidgetWide.class);
        if (small.length > 0) mgr.updateAppWidget(small, build(c, R.layout.widget_small));
        if (wide.length > 0) mgr.updateAppWidget(wide, build(c, R.layout.widget_wide));
    }

    private static RemoteViews build(Context c, int layout) {
        SharedPreferences p = Notifier.prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        boolean wide = layout == R.layout.widget_wide;
        JSONObject d;
        try { d = new JSONObject(p.getString(CACHE, "{}")); } catch (JSONException e) { d = new JSONObject(); }

        String place = p.getString("name", "");
        if (!p.contains("lat")) place = "Ort in der App wählen";
        v.setTextViewText(R.id.place, place);
        v.setTextViewText(R.id.temp, deg(d.optDouble("temp", Double.NaN)));
        v.setImageViewResource(R.id.icon, iconRes(c, d.optString("icon", "unknown")));
        if (wide) {
            v.setTextViewText(R.id.desc, d.optString("desc", p.contains("lat") ? "Daten werden geladen …" : ""));
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
        applyTheme(c, v, p.getString("theme", "system"), wide);

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    /** Fest gewähltes Hell/Dunkel aus der App übernehmen; bei „Wie System“ bleiben die Ressourcenfarben (folgen dem Systemmodus). */
    private static void applyTheme(Context c, RemoteViews v, String theme, boolean wide) {
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
    }

    private static int iconRes(Context c, String key) {
        int id = c.getResources().getIdentifier("wx_" + key.replace('-', '_'), "drawable", c.getPackageName());
        return id != 0 ? id : R.drawable.wx_unknown;
    }
}
