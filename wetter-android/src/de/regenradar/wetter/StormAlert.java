package de.regenradar.wetter;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.Calendar;
import java.util.Iterator;
import java.util.Locale;

/**
 * Unwetter im Umkreis: DWD-Warnungen der Stufen „Unwetter“ und „extremes Unwetter“ für Landkreise in der Nähe
 * (DWD-Geodienst, WFS), mit Entfernung und Richtung; Meldung auch, wenn eine Warnung aufgehoben ist.
 * Warnungen für den eigenen Ort meldet weiterhin CheckService (Bright Sky, alle Stufen).
 */
final class StormAlert {
    private static final String WFS = "https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=1.0.0&request=GetFeature"
        + "&typeName=dwd:Warnungen_Landkreise&outputFormat=application/json";
    private static final String[] TOWARD = { "nördlich", "nordöstlich", "östlich", "südöstlich", "südlich", "südwestlich", "westlich", "nordwestlich" };
    private static final String[] WD = { "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa" };

    private StormAlert() { }

    static void check(Context c, double lat, double lon, int radiusKm) throws Exception {
        // 1. Warnungen im Rechteck um den Umkreis – ohne Geometrie, damit die Antwort klein bleibt
        double dLat = radiusKm / 111.0, dLon = radiusKm / (111.0 * Math.cos(Math.toRadians(lat)));
        String bbox = String.format(Locale.ROOT, "%.4f,%.4f,%.4f,%.4f", lon - dLon, lat - dLat, lon + dLon, lat + dLat);
        JSONArray list;
        try {
            list = BrightSky.getJSON(WFS + "&propertyName=SEVERITY,EVENT,EC_II,HEADLINE,AREADESC,WARNCELLID,EXPIRES&bbox=" + bbox).getJSONArray("features");
        } catch (Exception e) {   // falls der Dienst die Feldauswahl ablehnt: vollständig abfragen
            list = BrightSky.getJSON(WFS + "&bbox=" + bbox).getJSONArray("features");
        }
        JSONObject found = new JSONObject();   // Schlüssel (Ereignis|Warngebiet) → Angaben
        StringBuilder cells = new StringBuilder();
        for (int i = 0; i < list.length(); i++) {
            JSONObject pr = list.getJSONObject(i).getJSONObject("properties");
            String sev = pr.optString("SEVERITY").toLowerCase(Locale.ROOT);
            if (!sev.equals("severe") && !sev.equals("extreme")) continue;
            String cell = pr.optString("WARNCELLID");
            String key = (pr.isNull("EC_II") ? pr.optString("EVENT") : pr.optString("EC_II")) + "|" + cell;
            found.put(key, pr);
            if (cells.indexOf("'" + cell + "'") < 0) cells.append(cells.length() > 0 ? "," : "").append("'").append(cell).append("'");
        }

        // 2. Geometrie nur der Gebiete mit Unwetter: Entfernung, Richtung, eigenes Gebiet ausklammern
        JSONObject where = new JSONObject();   // WARNCELLID → {km, dir} oder {own: true}
        if (cells.length() > 0) {
            JSONArray geo = BrightSky.getJSON(WFS + "&CQL_FILTER=" + URLEncoder.encode("WARNCELLID IN (" + cells + ")", "UTF-8"))
                .getJSONArray("features");
            for (int i = 0; i < geo.length(); i++) {
                JSONObject ft = geo.getJSONObject(i);
                where.put(ft.getJSONObject("properties").optString("WARNCELLID"), locate(ft.optJSONObject("geometry"), lat, lon));
            }
        }

        SharedPreferences p = Notifier.prefs(c);
        JSONObject active;
        try { active = new JSONObject(p.getString("stormActive", "{}")); } catch (JSONException e) { active = new JSONObject(); }
        JSONObject now = new JSONObject();
        for (Iterator<String> it = found.keys(); it.hasNext(); ) {
            String key = it.next();
            JSONObject pr = found.getJSONObject(key), at = where.optJSONObject(pr.optString("WARNCELLID"));
            if (at == null || !(at.has("km") || at.has("own"))) {   // Lage unbekannt: nichts Neues melden, nichts aufheben
                if (active.has(key)) now.put(key, active.get(key));
                continue;
            }
            if (at.optBoolean("own") || at.optDouble("km") > radiusKm) continue;
            String head = pr.isNull("HEADLINE") ? "Unwetterwarnung vor " + pr.optString("EVENT") : pr.optString("HEADLINE");
            String area = pr.optString("AREADESC");
            now.put(key, new JSONObject().put("head", head).put("area", area));
            if (active.has(key)) continue;
            String body = area + ", " + Math.round(at.optDouble("km")) + " km " + at.optString("dir") + until(pr.optString("EXPIRES")) + ".";
            Notifier.post(c, "storm-" + key, head, body, true);
        }
        // Aufgehoben bzw. abgelaufen: dieselbe Benachrichtigung ersetzen
        for (Iterator<String> it = active.keys(); it.hasNext(); ) {
            String key = it.next();
            if (now.has(key)) continue;
            JSONObject old = active.getJSONObject(key);
            Notifier.post(c, "storm-" + key, "Aufgehoben: " + old.optString("head"), old.optString("area") + " – die Unwetterwarnung ist nicht mehr aktiv.", true);
        }
        p.edit().putString("stormActive", now.toString()).apply();
    }

    private static String until(String iso) {
        try {
            long t = BrightSky.parseIso(iso);
            Calendar cal = Calendar.getInstance(), today = Calendar.getInstance();
            cal.setTimeInMillis(t);
            boolean same = cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) && cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR);
            return ", bis " + (same ? "" : WD[cal.get(Calendar.DAY_OF_WEEK) - 1] + " ") + BrightSky.hhmm(t) + " Uhr";
        } catch (Exception e) {
            return "";
        }
    }

    /** Lage eines (Multi-)Polygons zum Standort: {own: true}, wenn er darin liegt, sonst {km, dir} zum nächsten Randpunkt. */
    static JSONObject locate(JSONObject geom, double lat, double lon) throws JSONException {
        JSONObject out = new JSONObject();
        if (geom == null) return out;
        JSONArray polys = geom.getJSONArray("coordinates");
        if ("Polygon".equals(geom.optString("type"))) polys = new JSONArray().put(polys);
        double best = Double.MAX_VALUE, bLat = 0, bLon = 0;
        Boolean latFirst = null;
        for (int i = 0; i < polys.length(); i++) {
            JSONArray ring = polys.getJSONArray(i).getJSONArray(0);   // Außenring
            int n = ring.length();
            double[] la = new double[n], lo = new double[n];
            for (int k = 0; k < n; k++) {
                JSONArray pt = ring.getJSONArray(k);
                if (latFirst == null) latFirst = pt.getDouble(0) > 40;   // Achsenreihenfolge erkennen (Deutschland: Breite 47–55, Länge 5–15)
                la[k] = pt.getDouble(latFirst ? 0 : 1); lo[k] = pt.getDouble(latFirst ? 1 : 0);
            }
            if (inside(la, lo, lat, lon)) return out.put("own", true);
            for (int k = 0; k < n; k++) {
                double d = km(lat, lon, la[k], lo[k]);
                if (d < best) { best = d; bLat = la[k]; bLon = lo[k]; }
            }
        }
        if (best == Double.MAX_VALUE) return out;
        return out.put("km", best).put("dir", TOWARD[(int) Math.round(bearing(lat, lon, bLat, bLon) / 45) % 8]);
    }

    private static boolean inside(double[] la, double[] lo, double lat, double lon) {
        boolean in = false;
        for (int i = 0, j = la.length - 1; i < la.length; j = i++)
            if ((la[i] > lat) != (la[j] > lat) && lon < (lo[j] - lo[i]) * (lat - la[i]) / (la[j] - la[i]) + lo[i]) in = !in;
        return in;
    }

    static double km(double lat1, double lon1, double lat2, double lon2) {
        double x = Math.toRadians(lat2 - lat1), y = Math.toRadians(lon2 - lon1);
        double h = Math.pow(Math.sin(x / 2), 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(y / 2), 2);
        return 12742 * Math.asin(Math.sqrt(h));
    }

    static double bearing(double lat1, double lon1, double lat2, double lon2) {
        double f1 = Math.toRadians(lat1), f2 = Math.toRadians(lat2), dl = Math.toRadians(lon2 - lon1);
        double b = Math.toDegrees(Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)));
        return (b + 360) % 360;
    }
}
