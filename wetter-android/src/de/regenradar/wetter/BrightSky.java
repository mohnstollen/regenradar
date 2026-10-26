package de.regenradar.wetter;

import android.util.Base64;

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
import java.util.zip.Inflater;

/** Abrufe bei Bright Sky (DWD-Daten) – gemeinsam für Hintergrundprüfung und Widgets, Auswertung wie in app.js. */
final class BrightSky {
    static final String BS = "https://api.brightsky.dev";
    static final long MIN = 60 * 1000L;
    static final int RAIN_RAW = 5;                  // 0,05 mm/5 min, wie RAIN_RAW in app.js
    static final double LOC_KM = 1.5;

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

    /** Radarbilder (5-min-Schritte, 1-km-Gitter in DWD-Projektion) mit Standort im Gitter; v ≥ 2500 = keine Daten. */
    static final class Radar {
        long[] t;
        int[][] f;           // f[Bild][y * w + x], Einheit 0,01 mm / 5 min
        int w, h, now;       // now = Index des aktuellen Bildes
        double px, py, rot;  // Standort im Gitter, Drehung des Gitters gegen Nord (Grad)

        /** Höchster Wert im Umkreis von km um den Standort (Bild i). */
        int maxNear(int i, double km) {
            int max = 0;
            for (int yy = Math.max(0, (int) Math.floor(py - km)); yy <= Math.min(h - 1, (int) Math.ceil(py + km)); yy++)
                for (int xx = Math.max(0, (int) Math.floor(px - km)); xx <= Math.min(w - 1, (int) Math.ceil(px + km)); xx++) {
                    if (Math.hypot(xx - px, py - yy) > km) continue;
                    int v = f[i][yy * w + xx];
                    if (v < 2500 && v > max) max = v;
                }
            return max;
        }
    }

    /** Radar mit 2-h-Vorhersage für den Umkreis km (komprimiertes Format wie loadRadar() in app.js). */
    static Radar radar(double lat, double lon, double km) throws Exception {
        long now = System.currentTimeMillis();
        String q = String.format(Locale.ROOT, "%s/radar?lat=%.4f&lon=%.4f&distance=%d&format=compressed&date=%s&last_date=%s",
            BS, lat, lon, Math.round((km + 2) * 1000), URLEncoder.encode(iso(now - 10 * MIN), "UTF-8"), URLEncoder.encode(iso(now + 125 * MIN), "UTF-8"));
        JSONObject d = getJSON(q);
        JSONArray recs = d.optJSONArray("radar");
        if (recs == null || recs.length() == 0) throw new IOException("keine Radardaten");
        int n = recs.length();
        Radar r = new Radar();
        r.t = new long[n];
        r.f = new int[n][];
        JSONArray bbox = d.optJSONArray("bbox");
        Boolean le = null;
        for (int i = 0; i < n; i++) {
            JSONObject rec = recs.getJSONObject(i);
            r.t[i] = parseIso(rec.getString("timestamp"));
            byte[] b = inflate(Base64.decode(rec.getString("precipitation_5"), Base64.DEFAULT));
            if (le == null) le = bad(b, true) <= bad(b, false);   // Byte-Reihenfolge wie bad() in app.js erkennen
            int[] v = new int[b.length / 2];
            for (int k = 0; k < v.length; k++)
                v[k] = le ? (b[2 * k] & 0xff) | (b[2 * k + 1] & 0xff) << 8 : (b[2 * k] & 0xff) << 8 | (b[2 * k + 1] & 0xff);
            r.f[i] = v;
        }
        if (bbox != null) { r.h = bbox.getInt(2) - bbox.getInt(0) + 1; r.w = bbox.getInt(3) - bbox.getInt(1) + 1; }
        else r.w = r.h = (int) Math.round(Math.sqrt(r.f[0].length));
        for (int[] v : r.f) if (v.length != r.w * r.h) throw new IOException("unerwartetes Radar-Gitter");
        // zeitlich sortieren
        for (int i = 1; i < n; i++)
            for (int j = i; j > 0 && r.t[j - 1] > r.t[j]; j--) {
                long tt = r.t[j]; r.t[j] = r.t[j - 1]; r.t[j - 1] = tt;
                int[] ff = r.f[j]; r.f[j] = r.f[j - 1]; r.f[j - 1] = ff;
            }
        r.px = (r.w - 1) / 2.0; r.py = (r.h - 1) / 2.0;
        JSONObject pos = d.optJSONObject("latlon_position");
        if (pos != null && pos.has("x")) {
            r.px = pos.getDouble("x"); r.py = pos.getDouble("y");
            if (bbox != null && (r.px >= r.w || r.py >= r.h)) { r.px -= bbox.getInt(1); r.py -= bbox.getInt(0); }
        }
        r.rot = lon - 10;
        for (int i = 0; i < n; i++) if (r.t[i] <= now + MIN) r.now = i;
        return r;
    }

    private static byte[] inflate(byte[] in) throws Exception {
        Inflater inf = new Inflater();
        inf.setInput(in);
        ByteArrayOutputStream out = new ByteArrayOutputStream(in.length * 4);
        byte[] buf = new byte[16384];
        while (!inf.finished()) {
            int k = inf.inflate(buf);
            if (k == 0 && (inf.needsInput() || inf.needsDictionary())) break;
            out.write(buf, 0, k);
        }
        inf.end();
        return out.toByteArray();
    }

    private static int bad(byte[] b, boolean le) {
        int n = 0;
        for (int k = 0; k + 1 < b.length; k += 2) {
            int v = le ? (b[k] & 0xff) | (b[k + 1] & 0xff) << 8 : (b[k] & 0xff) << 8 | (b[k + 1] & 0xff);
            if (v > 2500 && v < 65000) n++;
        }
        return n;
    }

    static Nowcast nowcast(Radar r) {
        Nowcast nc = new Nowcast();
        nc.raining = r.maxNear(r.now, LOC_KM) >= RAIN_RAW;
        long now = System.currentTimeMillis();
        for (int i = r.now + 1; i < r.t.length; i++) {
            if (nc.raining == r.maxNear(i, LOC_KM) >= RAIN_RAW) continue;
            long m = Math.max(0, Math.round((r.t[i] - now) / (double) MIN));
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

    static JSONObject getJSON(String url) throws Exception {
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
