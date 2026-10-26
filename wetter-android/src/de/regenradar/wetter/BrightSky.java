package de.regenradar.wetter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Abrufe bei Bright Sky (DWD-Daten) – gemeinsam für Hintergrundprüfung und Widgets, Auswertung wie in app.js. */
final class BrightSky {
    static final String BS = "https://api.brightsky.dev";
    static final long MIN = 60 * 1000L;
    private static final int RAIN_RAW = 5;          // 0,05 mm/5 min, wie RAIN_RAW in app.js
    private static final double LOC_KM = 1.5;

    private BrightSky() { }

    /** Regen am Standort laut Radar mit 2-h-Vorhersage: raining jetzt, sonst eta (min) bis Regen; until (min) bis Ende; -1 = keins. */
    static final class Nowcast {
        boolean raining;
        long eta = -1, until = -1;
    }

    static JSONObject current(double lat, double lon) throws Exception {
        return getJSON(String.format(Locale.ROOT, "%s/current_weather?lat=%.4f&lon=%.4f&tz=Europe/Berlin", BS, lat, lon)).getJSONObject("weather");
    }

    /** Stundenwerte (Beobachtung + MOSMIX) im Zeitraum [from, to). */
    static JSONArray hourly(double lat, double lon, long from, long to) throws Exception {
        JSONArray a = getJSON(String.format(Locale.ROOT, "%s/weather?lat=%.4f&lon=%.4f&date=%s&last_date=%s&tz=Europe/Berlin",
            BS, lat, lon, URLEncoder.encode(iso(from), "UTF-8"), URLEncoder.encode(iso(to), "UTF-8"))).optJSONArray("weather");
        return a != null ? a : new JSONArray();
    }

    static JSONArray alerts(double lat, double lon) throws Exception {
        JSONArray a = getJSON(String.format(Locale.ROOT, "%s/alerts?lat=%.4f&lon=%.4f&tz=Europe/Berlin", BS, lat, lon)).optJSONArray("alerts");
        return a != null ? a : new JSONArray();
    }

    static Nowcast nowcast(double lat, double lon) throws Exception {
        long now = System.currentTimeMillis();
        String q = String.format(Locale.ROOT, "%s/radar?lat=%.4f&lon=%.4f&distance=3000&format=plain&date=%s&last_date=%s",
            BS, lat, lon, URLEncoder.encode(iso(now - 10 * MIN), "UTF-8"), URLEncoder.encode(iso(now + 125 * MIN), "UTF-8"));
        JSONObject d = getJSON(q);
        JSONArray recs = d.optJSONArray("radar");
        Nowcast nc = new Nowcast();
        if (recs == null || recs.length() == 0) return nc;

        // Bildmitte bzw. latlon_position wie loadRadar() in app.js
        JSONArray first = recs.getJSONObject(0).getJSONArray("precipitation_5");
        int h = first.length(), w = first.getJSONArray(0).length();
        double px = (w - 1) / 2.0, py = (h - 1) / 2.0;
        JSONObject pos = d.optJSONObject("latlon_position");
        JSONArray bbox = d.optJSONArray("bbox");
        if (pos != null && pos.has("x")) {
            px = pos.getDouble("x"); py = pos.getDouble("y");
            if (bbox != null && (px >= w || py >= h)) { px -= bbox.getInt(1); py -= bbox.getInt(0); }
        }

        int n = recs.length();
        long[] t = new long[n];
        int[] loc = new int[n];
        for (int i = 0; i < n; i++) {
            JSONObject r = recs.getJSONObject(i);
            t[i] = parseIso(r.getString("timestamp"));
            JSONArray g = r.getJSONArray("precipitation_5");
            int max = 0;
            for (int yy = Math.max(0, (int) Math.floor(py - LOC_KM)); yy <= Math.min(h - 1, (int) Math.ceil(py + LOC_KM)); yy++) {
                JSONArray row = g.getJSONArray(yy);
                for (int xx = Math.max(0, (int) Math.floor(px - LOC_KM)); xx <= Math.min(w - 1, (int) Math.ceil(px + LOC_KM)); xx++) {
                    if (Math.hypot(xx - px, py - yy) > LOC_KM) continue;
                    int v = row.optInt(xx, 0);
                    if (v < 2500 && v > max) max = v;
                }
            }
            loc[i] = max;
        }
        // Zeitlich sortieren
        for (int i = 1; i < n; i++)
            for (int j = i; j > 0 && t[j - 1] > t[j]; j--) {
                long tt = t[j]; t[j] = t[j - 1]; t[j - 1] = tt;
                int ll = loc[j]; loc[j] = loc[j - 1]; loc[j - 1] = ll;
            }
        int ni = 0;
        for (int i = 0; i < n; i++) if (t[i] <= now + MIN) ni = i;
        nc.raining = loc[ni] >= RAIN_RAW;
        for (int i = ni + 1; i < n; i++) {
            if (nc.raining == loc[i] >= RAIN_RAW) continue;
            long m = Math.max(0, Math.round((t[i] - now) / (double) MIN));
            if (nc.raining) nc.until = m; else nc.eta = m;
            break;
        }
        return nc;
    }

    static String hhmm(long ms) {
        SimpleDateFormat hm = new SimpleDateFormat("HH:mm", Locale.GERMANY);
        hm.setTimeZone(TimeZone.getTimeZone("Europe/Berlin"));
        return hm.format(new Date(ms));
    }

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    static long parseIso(String s) throws ParseException {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ROOT);
        return f.parse(s).getTime();
    }

    private static JSONObject getJSON(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        con.setRequestProperty("Accept", "application/json");
        try {
            if (con.getResponseCode() != 200) throw new IOException("HTTP " + con.getResponseCode());
            InputStream in = con.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
            return new JSONObject(out.toString("UTF-8"));
        } finally {
            con.disconnect();
        }
    }
}
