package de.regenradar.wetter;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

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

/**
 * Hintergrundprüfung (etwa alle 15 min, Android legt den genauen Zeitpunkt fest):
 * neue DWD-Warnungen (Bright Sky /alerts) und Regen am Standort (Bright Sky /radar) – wie in app.js.
 */
public class CheckService extends JobService {
    private static final int JOB_ID = 1;
    private static final long PERIOD = 15 * 60 * 1000L;
    private static final String BS = "https://api.brightsky.dev";
    private static final int RAIN_RAW = 5;          // 0,05 mm/5 min, wie RAIN_RAW in app.js
    private static final double LOC_KM = 1.5;
    private static final long MIN = 60 * 1000L;

    /** Plant die Prüfung ein oder beendet sie – je nach Einstellungen aus der Web-App. */
    static void update(Context c) {
        SharedPreferences p = Notifier.prefs(c);
        boolean on = (p.getBoolean("notify", false) || p.getBoolean("warnNotify", false)) && p.contains("lat");
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (!on) { js.cancel(JOB_ID); return; }
        if (js.getPendingJob(JOB_ID) != null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, CheckService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(PERIOD)
            .setPersisted(true)
            .build());
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                check(getApplicationContext());
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    private static void check(Context c) {
        SharedPreferences p = Notifier.prefs(c);
        if (!p.contains("lat") || !Notifier.allowed(c)) return;
        double lat = Double.longBitsToDouble(p.getLong("lat", 0)), lon = Double.longBitsToDouble(p.getLong("lon", 0));
        if (p.getBoolean("warnNotify", false)) {
            try { checkWarnings(c, lat, lon); } catch (Exception ignored) { }
        }
        if (p.getBoolean("notify", false)) {
            try { checkRain(c, lat, lon); } catch (Exception ignored) { }
        }
    }

    private static void checkWarnings(Context c, double lat, double lon) throws Exception {
        JSONObject d = getJSON(String.format(Locale.ROOT, "%s/alerts?lat=%.4f&lon=%.4f&tz=Europe/Berlin", BS, lat, lon));
        JSONArray list = d.optJSONArray("alerts");
        if (list == null) return;
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.getJSONObject(i);
            String id = a.optString("alert_id", a.optString("id", ""));
            if (id.isEmpty()) continue;
            String head = a.optString("headline_de", "");
            if (head.isEmpty() || head.equals("null")) head = a.optString("event_de", "Warnung");
            Notifier.show(c, "warn-" + id, "DWD-Warnung: " + head, a.optString("description_de", ""));
        }
    }

    private static void checkRain(Context c, double lat, double lon) throws Exception {
        long now = System.currentTimeMillis();
        String q = String.format(Locale.ROOT, "%s/radar?lat=%.4f&lon=%.4f&distance=3000&format=plain&date=%s&last_date=%s",
            BS, lat, lon, URLEncoder.encode(iso(now - 10 * MIN), "UTF-8"), URLEncoder.encode(iso(now + 125 * MIN), "UTF-8"));
        JSONObject d = getJSON(q);
        JSONArray recs = d.optJSONArray("radar");
        if (recs == null || recs.length() == 0) return;

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
        if (loc[ni] >= RAIN_RAW) return;   // regnet bereits
        for (int i = ni + 1; i < n; i++) {
            if (loc[i] < RAIN_RAW) continue;
            long eta = Math.max(0, Math.round((t[i] - now) / (double) MIN));
            SimpleDateFormat hm = new SimpleDateFormat("HH:mm", Locale.GERMANY);
            hm.setTimeZone(TimeZone.getTimeZone("Europe/Berlin"));
            Notifier.show(c, "rain", "Regen in ca. " + eta + " min",
                "Laut DWD-Radarvorhersage gegen " + hm.format(new Date(now + eta * MIN)) + ".");
            return;
        }
    }

    private static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.ROOT);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    private static long parseIso(String s) throws ParseException {
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
