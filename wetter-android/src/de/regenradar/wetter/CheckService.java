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

/**
 * Hintergrundprüfung (etwa alle 15 min, Android legt den genauen Zeitpunkt fest):
 * neue DWD-Warnungen und Regen am Standort für Benachrichtigungen, dazu die Daten der Widgets.
 */
public class CheckService extends JobService {
    private static final int JOB_ID = 1, JOB_NOW = 2;
    private static final long PERIOD = 15 * 60 * 1000L;

    /** Plant die regelmäßige Prüfung ein oder beendet sie – je nach Einstellungen und vorhandenen Widgets. */
    static void update(Context c) {
        SharedPreferences p = Notifier.prefs(c);
        boolean on = (p.getBoolean("notify", false) || p.getBoolean("warnNotify", false) || Widgets.any(c)) && p.contains("lat");
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (!on) { js.cancel(JOB_ID); return; }
        if (js.getPendingJob(JOB_ID) != null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, CheckService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(PERIOD)
            .setPersisted(true)
            .build());
    }

    /** Einmal so bald wie möglich prüfen (z. B. neues Widget, Ort in der App gewechselt). */
    static void runSoon(Context c) {
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(JOB_NOW, new ComponentName(c, CheckService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setOverrideDeadline(60 * 1000L)
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
        if (!p.contains("lat")) return;
        double lat = Double.longBitsToDouble(p.getLong("lat", 0)), lon = Double.longBitsToDouble(p.getLong("lon", 0));
        boolean allowed = Notifier.allowed(c), widgets = Widgets.any(c);
        boolean rain = allowed && p.getBoolean("notify", false);
        if (allowed && p.getBoolean("warnNotify", false)) {
            try { checkWarnings(c, lat, lon); } catch (Exception ignored) { }
        }
        BrightSky.Nowcast nc = null;
        if (rain || widgets) {
            try { nc = BrightSky.nowcast(lat, lon); } catch (Exception ignored) { }
        }
        if (rain && nc != null && !nc.raining && nc.eta >= 0) {
            Notifier.show(c, "rain", "Regen in ca. " + nc.eta + " min",
                "Laut DWD-Radarvorhersage gegen " + BrightSky.hhmm(System.currentTimeMillis() + nc.eta * BrightSky.MIN) + ".");
        }
        if (widgets) Widgets.refresh(c, lat, lon, nc);
    }

    private static void checkWarnings(Context c, double lat, double lon) throws Exception {
        JSONArray list = BrightSky.alerts(lat, lon);
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.getJSONObject(i);
            String id = a.optString("alert_id", a.optString("id", ""));
            if (id.isEmpty()) continue;
            String head = a.optString("headline_de", "");
            if (head.isEmpty() || head.equals("null")) head = a.optString("event_de", "Warnung");
            Notifier.show(c, "warn-" + id, "DWD-Warnung: " + head, a.optString("description_de", ""));
        }
    }
}
