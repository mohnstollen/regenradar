package de.regenradar.wetter;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.graphics.Typeface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Zeichnet den Temperaturverlauf der nächsten 12 Stunden für die Diagramm-Widgets – nach dem Vorbild von drawChart()
 * in app.js: Kurve mit Fläche, Werte alle 3 Stunden sowie am Tiefst- und Höchstwert, Zeitachse „jetzt, 12 Uhr …“.
 * Mit extras darunter je Stunde Sonnenschein (Balken) und Regenwahrscheinlichkeit (blaue Felder mit Zahl).
 */
final class ChartImage {
    private static final long HOUR = 3600000L;
    private static final int TEMP = 0xFFE8590C, SUN = 0xFFF2B705, RAIN = 0xFF3D8BFD;

    private ChartImage() { }

    /**
     * @param chart  Stundenwerte [{t, temp, sun (min), prob (%)}]
     * @param w, h   Größe in Pixeln, d = Pixel je dp
     */
    static Bitmap draw(JSONArray chart, String place, String stand, int w, int h, float d, boolean extras, boolean dark) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int text = dark ? 0xFFE6EDF3 : 0xFF1C2733, muted = dark ? 0xFF93A1B0 : 0xFF6B7A8C, grid = dark ? 0x33E6EDF3 : 0x261C2733;
        Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
        pt.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));

        // Kopf: Ort links, Modell und Stand rechts
        float pad = 12 * d, top = 10 * d;
        pt.setTextSize(12 * d); pt.setColor(text); pt.setFakeBoldText(true);
        cv.drawText(ellipsize(pt, place, w * 0.55f), pad, top + 11 * d, pt);
        pt.setFakeBoldText(false); pt.setTextSize(10 * d); pt.setColor(muted);
        pt.setTextAlign(Paint.Align.RIGHT);
        cv.drawText(stand, w - pad, top + 11 * d, pt);
        pt.setTextAlign(Paint.Align.LEFT);

        long t0 = hourStart(System.currentTimeMillis()), t1 = t0 + 12 * HOUR;
        int n = chart == null ? 0 : chart.length();
        long[] ts = new long[n]; double[] tv = new double[n], sun = new double[n], prob = new double[n];
        int cnt = 0;
        for (int i = 0; i < n; i++) {
            JSONObject r = chart.optJSONObject(i);
            if (r == null || r.isNull("temp")) continue;
            ts[cnt] = r.optLong("t"); tv[cnt] = r.optDouble("temp");
            sun[cnt] = r.isNull("sun") ? Double.NaN : r.optDouble("sun", Double.NaN);
            prob[cnt] = r.isNull("prob") ? Double.NaN : r.optDouble("prob", Double.NaN);
            cnt++;
        }
        double tmin = Double.POSITIVE_INFINITY, tmax = Double.NEGATIVE_INFINITY; int iMin = -1, iMax = -1;
        for (int i = 0; i < cnt; i++) if (ts[i] >= t0 && ts[i] <= t1) {
            if (tv[i] < tmin) { tmin = tv[i]; iMin = i; }
            if (tv[i] > tmax) { tmax = tv[i]; iMax = i; }
        }
        if (iMin < 0) {
            pt.setTextSize(12 * d); pt.setColor(muted);
            cv.drawText("Daten werden geladen …", pad, h / 2f, pt);
            return bmp;
        }

        // Flächen: Achsenbeschriftung links, Zeitachse unten, darunter ggf. Sonne und Regen
        float rowH = 13 * d, extraH = extras ? 2 * rowH + 6 * d : 0;
        float left = pad + 20 * d, right = w - pad - 4 * d;
        float plotTop = top + 30 * d, xLabel = h - 8 * d - extraH, plotBottom = xLabel - 14 * d;
        if (plotBottom - plotTop < 30 * d) plotTop = Math.max(top + 16 * d, plotBottom - 30 * d);
        double lo = Math.floor(tmin - 1), hi = Math.ceil(tmax + 1);
        if (hi - lo < 6) { double mid = (hi + lo) / 2; lo = Math.floor(mid - 3); hi = Math.ceil(mid + 3); }
        final float L = left, R = right, PT = plotTop, PB = plotBottom; final double LO = lo, HI = hi; final long T0 = t0;
        Mapper m = new Mapper() {
            public float x(long t) { return L + (float) (t - T0) / (12 * HOUR) * (R - L); }
            public float y(double v) { return PB - (float) ((v - LO) / (HI - LO)) * (PB - PT); }
        };

        // Gitter und Temperaturachse
        Paint gp = new Paint(Paint.ANTI_ALIAS_FLAG);
        gp.setColor(grid); gp.setStrokeWidth(Math.max(1, d));
        double step = 1;   // Gitterabstand nach Platz: mindestens 14 dp zwischen zwei Linien
        for (double s : new double[] { 1, 2, 5, 10 }) { step = s; if ((plotBottom - plotTop) / ((hi - lo) / s) >= 14 * d) break; }
        pt.setTextSize(9.5f * d); pt.setColor(muted); pt.setTextAlign(Paint.Align.RIGHT);
        for (double v = Math.ceil(lo / step) * step; v <= hi; v += step) {
            float y = m.y(v);
            cv.drawLine(left, y, right, y, gp);
            cv.drawText(fmt(v) + "°", left - 4 * d, y + 3.5f * d, pt);
        }
        if (lo < 0 && hi > 0) {
            Paint zp = new Paint(Paint.ANTI_ALIAS_FLAG);
            zp.setColor(0xFF4DABF7); zp.setStrokeWidth(Math.max(1, d)); zp.setPathEffect(new android.graphics.DashPathEffect(new float[] { 4 * d, 3 * d }, 0));
            cv.drawLine(left, m.y(0), right, m.y(0), zp);
        }
        // Zeitachse alle 3 Stunden
        pt.setTextSize(10 * d);
        for (long t = t0; t <= t1; t += 3 * HOUR) {
            float x = m.x(t);
            cv.drawLine(x, plotTop, x, plotBottom, gp);
            String lbl = t == t0 ? "jetzt" : hourOf(t) + " Uhr";
            pt.setTextAlign(t == t0 ? Paint.Align.LEFT : t == t1 ? Paint.Align.RIGHT : Paint.Align.CENTER);
            cv.drawText(lbl, t == t0 ? x - 4 * d : x, xLabel, pt);
        }

        // Kurve: geglättet wie curve() in app.js, darunter Fläche mit Verlauf
        Path line = new Path();
        float fx = 0, lx = 0; boolean first = true; float px = 0, py = 0;
        for (int i = 0; i < cnt; i++) {
            if (ts[i] < t0 - HOUR || ts[i] > t1 + HOUR) continue;
            float x = m.x(ts[i]), y = m.y(tv[i]);
            if (first) { line.moveTo(x, y); fx = x; first = false; }
            else { float cx = (px + x) / 2; line.cubicTo(cx, py, cx, y, x, y); }
            px = x; py = y; lx = x;
        }
        cv.save();
        cv.clipRect(left, 0, right, plotBottom);
        Path area = new Path(line);
        area.lineTo(lx, plotBottom); area.lineTo(fx, plotBottom); area.close();
        Paint ap = new Paint(Paint.ANTI_ALIAS_FLAG);
        ap.setShader(new LinearGradient(0, plotTop, 0, plotBottom, (TEMP & 0x00FFFFFF) | 0x40000000, (TEMP & 0x00FFFFFF) | 0x08000000, Shader.TileMode.CLAMP));
        cv.drawPath(area, ap);
        Paint lp = new Paint(Paint.ANTI_ALIAS_FLAG);
        lp.setStyle(Paint.Style.STROKE); lp.setColor(TEMP); lp.setStrokeWidth(2.6f * d);
        lp.setStrokeCap(Paint.Cap.ROUND); lp.setStrokeJoin(Paint.Join.ROUND);
        cv.drawPath(line, lp);
        cv.restore();

        // Werte: alle 3 Stunden sowie Tiefst- und Höchstwert
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(dark ? 0xFF18212B : 0xFF1C2733);
        ring.setStyle(Paint.Style.STROKE); ring.setColor(TEMP); ring.setStrokeWidth(2 * d);
        pt.setTextSize(11 * d); pt.setColor(text); pt.setFakeBoldText(true); pt.setTextAlign(Paint.Align.CENTER);
        // Liegt Tiefst- oder Höchstwert höchstens 1 h neben einem 3-Stunden-Punkt, ersetzt er diesen (keine doppelten Zahlen)
        boolean[] show = new boolean[cnt];
        for (int i = 0; i < cnt; i++)
            show[i] = ts[i] >= t0 && ts[i] <= t1 && (ts[i] - t0) % (3 * HOUR) == 0;
        for (int e : new int[] { iMin, iMax }) {
            for (int i = 0; i < cnt; i++) if (show[i] && i != e && Math.abs(ts[i] - ts[e]) <= HOUR) show[i] = false;
            show[e] = true;
        }
        for (int i = 0; i < cnt; i++) {
            if (!show[i]) continue;
            float x = m.x(ts[i]), y = m.y(tv[i]);
            cv.drawCircle(x, y, 3.5f * d, dot);
            cv.drawCircle(x, y, 3.5f * d, ring);
            float lxp = Math.min(Math.max(x, left + 10 * d), right - 8 * d);
            boolean below = i == iMin && i != iMax && y - 20 * d < plotTop;
            cv.drawText(fmt(tv[i]) + "°", lxp, below ? y + 16 * d : y - 8 * d, pt);
        }
        pt.setFakeBoldText(false);

        if (extras) {
            // je Stunde ein Feld; Sonne als Balken (Anteil der Stunde), Regenwahrscheinlichkeit als blaues Feld mit Zahl
            float sunTop = xLabel + 6 * d, probTop = sunTop + rowH + 2 * d, cw = (right - left) / 12f;
            Paint sp = new Paint(Paint.ANTI_ALIAS_FLAG), rp = new Paint(Paint.ANTI_ALIAS_FLAG), base = new Paint(Paint.ANTI_ALIAS_FLAG);
            sp.setColor(SUN); base.setColor(grid); base.setStrokeWidth(Math.max(1, d));
            pt.setTextSize(8.5f * d); pt.setTextAlign(Paint.Align.CENTER);
            for (int k = 0; k < 12; k++) {
                long a = t0 + k * HOUR, b = a + HOUR;
                double s = Double.NaN, p = Double.NaN;
                for (int i = 0; i < cnt; i++) if (ts[i] > a && ts[i] <= b) { s = sun[i]; p = prob[i]; }   // Werte gelten für die Stunde davor
                float x0 = left + k * cw + 1.5f * d, x1 = left + (k + 1) * cw - 1.5f * d, cx = (x0 + x1) / 2;
                cv.drawLine(x0, sunTop + rowH, x1, sunTop + rowH, base);
                if (!Double.isNaN(s) && s >= 1) {
                    float bh = Math.max(2 * d, (float) Math.min(s, 60) / 60f * rowH);
                    cv.drawRoundRect(new android.graphics.RectF(x0, sunTop + rowH - bh, x1, sunTop + rowH), 2 * d, 2 * d, sp);
                }
                if (!Double.isNaN(p)) {
                    int pc = (int) Math.round(p);
                    rp.setColor(RAIN); rp.setAlpha((int) Math.round(255 * (0.08 + 0.8 * pc / 100.0)));
                    cv.drawRoundRect(new android.graphics.RectF(x0, probTop, x1, probTop + rowH), 2.5f * d, 2.5f * d, rp);
                    if (cw >= 15 * d) {
                        pt.setColor(pc >= 55 ? 0xFFFFFFFF : text);
                        cv.drawText(String.valueOf(pc), cx, probTop + rowH - 3.5f * d, pt);
                    }
                }
            }
            // Zeilenkennung links: Sonne und Regentropfen
            Paint ic = new Paint(Paint.ANTI_ALIAS_FLAG);
            ic.setColor(SUN);
            float ix = left - 10 * d;
            cv.drawCircle(ix, sunTop + rowH / 2, 3.2f * d, ic);
            ic.setStrokeWidth(1.2f * d);
            for (int k = 0; k < 8; k++) {
                double an = Math.PI / 4 * k;
                cv.drawLine(ix + (float) Math.cos(an) * 4.6f * d, sunTop + rowH / 2 + (float) Math.sin(an) * 4.6f * d,
                    ix + (float) Math.cos(an) * 6.2f * d, sunTop + rowH / 2 + (float) Math.sin(an) * 6.2f * d, ic);
            }
            ic.setColor(RAIN);
            Path drop = new Path();
            float dy = probTop + rowH / 2;
            drop.moveTo(ix, dy - 5.5f * d);
            drop.cubicTo(ix + 4.5f * d, dy, ix + 4 * d, dy + 4.5f * d, ix, dy + 4.5f * d);
            drop.cubicTo(ix - 4 * d, dy + 4.5f * d, ix - 4.5f * d, dy, ix, dy - 5.5f * d);
            cv.drawPath(drop, ic);
        }
        return bmp;
    }

    private interface Mapper { float x(long t); float y(double v); }

    private static long hourStart(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    private static int hourOf(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return c.get(Calendar.HOUR_OF_DAY);
    }

    private static String fmt(double v) { return DailyForecast.fmt0(v); }

    private static String ellipsize(Paint p, String s, float max) {
        if (p.measureText(s) <= max) return s;
        while (s.length() > 1 && p.measureText(s + "…") > max) s = s.substring(0, s.length() - 1);
        return s + "…";
    }
}
