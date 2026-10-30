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

import java.util.Iterator;

/**
 * Hintergrundprüfung (etwa alle 15 min, Android legt den genauen Zeitpunkt fest):
 * Regen im Anmarsch, DWD-Warnungen am Ort und Unwetter im Umkreis für Benachrichtigungen, dazu die Daten der Widgets.
 * Ist Regen im Anmarsch, wird nach etwa 5 min erneut geprüft (für die Meldungen bei 30 und 10 min).
 */
public class CheckService extends JobService {
    private static final int JOB_ID = 1, JOB_NOW = 2, JOB_SOON = 3;
    private static final long PERIOD = 15 * 60 * 1000L;

    /** Plant die regelmäßige Prüfung ein oder beendet sie – je nach Einstellungen und vorhandenen Widgets. */
    static void update(Context c) {
        SharedPreferences p = Notifier.prefs(c);
        boolean on = (p.getBoolean("notify", false) || p.getBoolean("warnNotify", false) || p.getBoolean("stormNotify", false)
            || Widgets.any(c)) && p.contains("lat");
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

    /** Einmal nach etwa delay ms erneut prüfen. */
    static void runIn(Context c, long delay) {
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(JOB_SOON, new ComponentName(c, CheckService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setMinimumLatency(delay)
            .setOverrideDeadline(delay + 60 * 1000L)
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
        BrightSky.Radar radar = null;
        if (rain || widgets) {   // ein Radarabruf für Regenmeldung und Widgets
            try { radar = BrightSky.radar(lat, lon, rain ? Math.max(3, p.getInt("rainRadius", 10)) : 3); } catch (Exception ignored) { }
        }
        boolean approaching = rain && radar != null && RainAlert.check(c, radar);
        if (allowed && p.getBoolean("warnNotify", false)) {
            try { checkWarnings(c, lat, lon); } catch (Exception ignored) { }
        }
        if (allowed && p.getBoolean("stormNotify", false)) {
            try { StormAlert.check(c, lat, lon, p.getInt("stormRadius", 50)); } catch (Exception ignored) { }
        }
        if (widgets) Widgets.refreshAll(c, lat, lon, radar != null ? BrightSky.nowcast(radar) : null);
        if (approaching) runIn(c, 5 * 60 * 1000L);
    }

    private static void checkWarnings(Context c, double lat, double lon) throws Exception {
        JSONArray list = BrightSky.alerts(lat, lon);
        SharedPreferences p = Notifier.prefs(c);
        JSONObject severeBefore;
        try { severeBefore = new JSONObject(p.getString("localSevere", "{}")); } catch (Exception e) { severeBefore = new JSONObject(); }
        JSONObject severe = new JSONObject();   // Unwetter am Ort: Ereignis → {tag, head}, für die Meldung der Aufhebung
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.getJSONObject(i);
            String id = a.optString("alert_id", a.optString("id", ""));
            if (id.isEmpty()) continue;
            String head = a.optString("headline_de", "");
            if (head.isEmpty() || head.equals("null")) head = a.optString("event_de", "Warnung");
            Notifier.show(c, "warn-" + id, "DWD-Warnung: " + head, a.optString("description_de", ""));
            String sev = a.optString("severity");
            if (sev.equals("severe") || sev.equals("extreme"))
                severe.put(a.optString("event_de", head), new JSONObject().put("tag", "warn-" + id).put("head", head));
        }
        for (Iterator<String> it = severeBefore.keys(); it.hasNext(); ) {
            String ev = it.next();
            if (severe.has(ev)) continue;
            JSONObject old = severeBefore.getJSONObject(ev);
            Notifier.post(c, old.optString("tag"), "Aufgehoben: " + old.optString("head"), "Die Unwetterwarnung für Deinen Ort ist nicht mehr aktiv.", true);
        }
        p.edit().putString("localSevere", severe.toString()).apply();
    }
}
