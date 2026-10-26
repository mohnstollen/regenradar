package de.regenradar.wetter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;

/** Native Benachrichtigungen – gemeinsam für die Web-App (über die Brücke) und die Hintergrundprüfung. */
final class Notifier {
    static final String PREFS = "wetter";
    static final String POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS";
    private static final String CH_RAIN = "rain", CH_WARN = "warn";
    private static final long RAIN_PAUSE = 60 * 60 * 1000L;   // wie LS_RAIN in app.js
    private static final int MAX_SEEN = 100;

    private Notifier() { }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean allowed(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return nm.areNotificationsEnabled();
    }

    private static void createChannels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel rain = new NotificationChannel(CH_RAIN, "Regen in Kürze", NotificationManager.IMPORTANCE_HIGH);
        rain.setDescription("Hinweis, wenn laut DWD-Radarvorhersage Regen naht");
        NotificationChannel warn = new NotificationChannel(CH_WARN, "DWD-Warnungen", NotificationManager.IMPORTANCE_HIGH);
        warn.setDescription("Neue amtliche Warnungen des Deutschen Wetterdienstes");
        nm.createNotificationChannel(rain);
        nm.createNotificationChannel(warn);
    }

    /**
     * Zeigt eine Benachrichtigung. tag: "rain", "warn-<id>" oder "test".
     * Bereits gemeldete Warnungen und Regenhinweise innerhalb einer Stunde werden still übersprungen
     * (Rückgabe true = erledigt), damit App und Hintergrundprüfung nicht doppelt melden.
     */
    static synchronized boolean show(Context c, String tag, String title, String body) {
        if (!allowed(c)) return false;
        SharedPreferences p = prefs(c);
        boolean warn = tag.startsWith("warn-");
        long now = System.currentTimeMillis();
        JSONArray seen = seenWarnings(p);
        if (warn && contains(seen, tag)) return true;
        if (tag.equals("rain") && now - p.getLong("lastRain", 0) < RAIN_PAUSE) return true;

        post(c, tag, title, body, warn);

        SharedPreferences.Editor e = p.edit();
        if (warn) {
            seen.put(tag);
            while (seen.length() > MAX_SEEN) seen.remove(0);
            e.putString("seenWarnings", seen.toString());
        } else if (tag.equals("rain")) {
            e.putLong("lastRain", now);
        }
        e.apply();
        return true;
    }

    /** Zeigt bzw. ersetzt die Benachrichtigung mit diesem Tag – ohne Duplikatsperre. */
    static void post(Context c, String tag, String title, String body, boolean warn) {
        if (!allowed(c)) return;
        long now = System.currentTimeMillis();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        createChannels(nm);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(c, warn ? CH_WARN : CH_RAIN)
            : legacyBuilder(c);
        b.setSmallIcon(R.drawable.ic_stat)
            .setColor(0xff0b5cab)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setWhen(now)
            .setShowWhen(true);
        nm.notify(tag, 1, b.build());
    }

    static void cancel(Context c, String tag) {
        c.getSystemService(NotificationManager.class).cancel(tag, 1);
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder legacyBuilder(Context c) {
        return new Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
    }

    private static JSONArray seenWarnings(SharedPreferences p) {
        try { return new JSONArray(p.getString("seenWarnings", "[]")); }
        catch (JSONException e) { return new JSONArray(); }
    }

    private static boolean contains(JSONArray a, String s) {
        for (int i = 0; i < a.length(); i++) if (s.equals(a.optString(i))) return true;
        return false;
    }
}
