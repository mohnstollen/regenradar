package de.regenradar.wetter;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Calendar;
import java.util.Locale;

/**
 * Abendmeldung bei Frost oder Glätte für die Nacht bis morgen 10 Uhr – nur wenn etwas zu erwarten ist.
 * Daten wie bei der Morgen-Tagesvorhersage: ICON-D2-RUC, wo vorhanden, sonst ICON-D2 bzw. ICON kombiniert.
 * Regeln wie in der Hinweis-Zeile der App (buildInsight in app.js): Schneeglätte, Glätte (nass + ≤ 0,5 °C), Frost (≤ 0 °C).
 */
final class FrostAlert {
    private FrostAlert() { }

    /** Prüfen und ggf. melden; force = Test: auch ohne Frost eine Meldung. Liefert den Status für die Einstellungen. */
    static String runLogged(Context c, boolean force) throws Exception {
        SharedPreferences p = Notifier.prefs(c);
        try {
            String st = run(c, force);
            p.edit().putLong("frostNotifyLastAt", System.currentTimeMillis()).putString("frostNotifyLast", st).apply();
            return st;
        } catch (Exception e) {
            p.edit().putLong("frostNotifyLastAt", System.currentTimeMillis()).putString("frostNotifyLast", "Fehler: " + DailyForecast.reason(e)).apply();
            throw e;
        }
    }

    private static String run(Context c, boolean force) throws Exception {
        SharedPreferences p = Notifier.prefs(c);
        if (!Notifier.allowed(c)) throw new Exception("Benachrichtigungen nicht erlaubt");
        boolean daily = p.contains("dailyLat");   // Ort der Tagesvorhersage, sonst der Ort aus der App
        if (!daily && !p.contains("lat")) throw new Exception("kein Ort festgelegt");
        double lat = Double.longBitsToDouble(p.getLong(daily ? "dailyLat" : "lat", 0)), lon = Double.longBitsToDouble(p.getLong(daily ? "dailyLon" : "lon", 0));
        String place = p.getString(daily ? "dailyName" : "name", "");
        DailyForecast.Data d;
        try { d = DailyForecast.fetch(lat, lon, "dwd_icon_d2_native"); }
        catch (Exception e) { d = DailyForecast.fetch(lat, lon, "icon_seamless"); }   // außerhalb des ICON-D2-Gebiets
        try { d = DailyForecast.overlay(d, DailyForecast.fetch(lat, lon, "dwd_icon_d2_ruc_native")); } catch (Exception ignored) { }

        long now = System.currentTimeMillis(), H = 3600000L;
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        cal.add(Calendar.DAY_OF_MONTH, cal.get(Calendar.HOUR_OF_DAY) >= 10 ? 1 : 0);
        cal.set(Calendar.HOUR_OF_DAY, 10); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        long end = cal.getTimeInMillis();
        double tmin = Double.POSITIVE_INFINITY, snow = 0;
        long tminAt = 0;
        boolean wet = false;
        for (DailyForecast.Row r : d.rows) {
            if (r.t > now - 6 * H && r.t <= end && r.mm >= 0.1) wet = true;   // auch Regen der letzten Stunden macht Straßen nass
            if (r.t <= now || r.t > end) continue;
            if (r.temp < tmin) { tmin = r.temp; tminAt = r.t; }
            snow += r.snow;
        }
        if (Double.isInfinite(tmin)) throw new Exception("keine Vorhersagedaten");
        String at = "gegen " + hour(tminAt) + " Uhr", t = deg(tmin);
        String title, body;
        if (snow >= 0.3 && tmin <= 1) {
            title = "Schneeglätte heute Nacht";
            body = "Etwa " + String.format(Locale.GERMANY, snow < 3 ? "%.1f" : "%.0f", snow) + " cm Neuschnee bis morgen früh, tiefstens " + t + " " + at + ". Vorsicht auf Straßen und Wegen.";
        } else if (tmin <= 0.5 && wet) {
            title = "Glättegefahr heute Nacht";
            body = "Nasse Straßen können überfrieren: tiefstens " + t + " " + at + ".";
        } else if (tmin <= 0) {
            title = "Frost heute Nacht";
            body = "Tiefstens " + t + " " + at + " – morgen früh Scheiben kratzen.";
        } else if (force) {
            title = "Kein Frost erwartet";
            body = "Tiefstens " + t + " " + at + " bis morgen 10 Uhr.";
        } else {
            return "kein Frost (tiefstens " + t + ")";
        }
        Notifier.post(c, "frost", title + (place.isEmpty() ? "" : " – " + place), body, Notifier.CH_DAILY);
        return "gesendet: " + title;
    }

    private static int hour(long t) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(t);   // Temperatur: Wert zur vollen Stunde
        return cal.get(Calendar.HOUR_OF_DAY);
    }

    private static String deg(double v) {
        long r = Math.round(v);
        return (r == 0 ? "0" : r < 0 ? "−" + (-r) : String.valueOf(r)) + " °C";
    }
}
