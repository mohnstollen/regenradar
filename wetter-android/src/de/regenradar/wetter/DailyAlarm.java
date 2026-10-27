package de.regenradar.wetter;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/**
 * Wecker für die Tagesvorhersage (abends für morgen, morgens für heute) zur eingestellten Uhrzeit.
 * Genauer Wecker (USE_EXACT_ALARM), der auch im Energiesparmodus weckt; ohne Erlaubnis ein ungenauer.
 * Klappt der Abruf nicht, versucht es DailyService erneut, sobald Netz da ist.
 * Hinweis Xiaomi/HyperOS: ohne „Autostart“ stellt das System Wecker geschlossener Apps nicht zu.
 */
public class DailyAlarm extends BroadcastReceiver {
    private static final String ACTION = "de.regenradar.wetter.DAILY";

    /** Beide Wecker nach den Einstellungen stellen oder löschen. */
    static void schedule(Context c) {
        scheduleOne(c, true);
        scheduleOne(c, false);
    }

    private static void scheduleOne(Context c, boolean evening) {
        SharedPreferences p = Notifier.prefs(c);
        String key = evening ? "dailyEve" : "dailyMorn";
        PendingIntent pi = PendingIntent.getBroadcast(c, evening ? 10 : 11,
            new Intent(c, DailyAlarm.class).setAction(ACTION).putExtra("evening", evening),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (!p.getBoolean(key, false) || !p.contains("dailyLat")) { am.cancel(pi); p.edit().remove(key + "Next").apply(); return; }
        long t = next(p.getString(key + "Time", evening ? "20:00" : "06:30"), System.currentTimeMillis());
        if (exactAllowed(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
        p.edit().putLong(key + "Next", t).apply();   // für die Statusanzeige in den Einstellungen
    }

    static boolean exactAllowed(Context c) {
        return Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    /** Nächster Zeitpunkt „HH:mm“ nach now (frühestens in einer Minute). */
    static long next(String hhmm, long now) {
        int h = 20, m = 0;
        try { String[] a = hhmm.split(":"); h = Integer.parseInt(a[0].trim()); m = Integer.parseInt(a[1].trim()); } catch (Exception ignored) { }
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        cal.set(Calendar.HOUR_OF_DAY, h); cal.set(Calendar.MINUTE, m); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= now + 60 * 1000L) cal.add(Calendar.DAY_OF_MONTH, 1);
        return cal.getTimeInMillis();
    }

    @Override
    public void onReceive(final Context c, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        final boolean evening = intent.getBooleanExtra("evening", true);
        final PendingResult done = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try { DailyForecast.runLogged(c, evening); }
                catch (Exception e) { DailyService.retry(c, evening); }
                finally {
                    scheduleOne(c, evening);   // nächster Tag
                    done.finish();
                }
            }
        }).start();
    }
}
