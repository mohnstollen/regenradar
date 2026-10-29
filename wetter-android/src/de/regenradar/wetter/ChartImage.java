package de.regenradar.wetter;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Zeichnet den Temperaturverlauf (12, 24 oder 48 Stunden) für die Diagramm-Widgets – nach dem Vorbild von drawChart()
 * in app.js: Kurve mit Fläche, Werte in festen Abständen sowie am Tiefst- und Höchstwert, Zeitachse „jetzt, 12 Uhr …“.
 * Darunter auf Wunsch Zeilen in 12 gleich breiten Feldern (je 1, 2 oder 4 Stunden): Sonnenschein (Balken),
 * Regenwahrscheinlichkeit (blaues Feld mit Zahl, höchster Wert) und Wind (km/h im Mittel, Pfeil in Zugrichtung).
 */
final class ChartImage {
    private static final long HOUR = 3600000L;
    private static final int TEMP = 0xFFE8590C, SUN = 0xFFF2B705, RAIN = 0xFF3D8BFD;
    private static final String[] WD = { "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa" };
    static final int ROW_SUN = 1, ROW_RAIN = 2, ROW_WIND = 4;

    private ChartImage() { }

    /**
     * @param chart  Stundenwerte [{t, temp, sun (min), prob (%), wind (km/h), dir (Grad, woher)}]
     * @param place  Ort für den Kopf; null = ohne Kopf (Widget hat eigenen)
     * @param w, h   Größe in Pixeln, d = Pixel je dp
     * @param hours  12, 24 oder 48
     * @param rows   Zeilen unter der Zeitachse: ROW_SUN | ROW_RAIN | ROW_WIND
     */
    static Bitmap draw(JSONArray chart, String place, String stand, int w, int h, float d, int hours, int rows, boolean dark) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int text = dark ? 0xFFE6EDF3 : 0xFF1C2733, muted = dark ? 0xFF93A1B0 : 0xFF6B7A8C, grid = dark ? 0x33E6EDF3 : 0x261C2733;
        Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
        pt.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));

        float pad = 12 * d, top = place != null ? 10 * d : 0;
        if (place != null) {   // Kopf: Ort links, Zeitraum, Modell und Stand rechts
            pt.setTextSize(12 * d); pt.setColor(text); pt.setFakeBoldText(true);
            cv.drawText(ellipsize(pt, place, w * 0.5f), pad, top + 11 * d, pt);
            pt.setFakeBoldText(false); pt.setTextSize(10 * d); pt.setColor(muted);
            pt.setTextAlign(Paint.Align.RIGHT);
            cv.drawText(stand, w - pad, top + 11 * d, pt);
            pt.setTextAlign(Paint.Align.LEFT);
        }

        long t0 = hourStart(System.currentTimeMillis()), t1 = t0 + hours * HOUR;
        int n = chart == null ? 0 : chart.length();
        long[] ts = new long[n];
        double[] tv = new double[n], sun = new double[n], prob = new double[n], wind = new double[n], dir = new double[n];
        int cnt = 0;
        for (int i = 0; i < n; i++) {
            JSONObject r = chart.optJSONObject(i);
            if (r == null || r.isNull("temp")) continue;
            ts[cnt] = r.optLong("t"); tv[cnt] = r.optDouble("temp");
            sun[cnt] = opt(r, "sun"); prob[cnt] = opt(r, "prob"); wind[cnt] = opt(r, "wind"); dir[cnt] = opt(r, "dir");
            cnt++;
        }
        double tmin = Double.POSITIVE_INFINITY, tmax = Double.NEGATIVE_INFINITY; int iMin = -1, iMax = -1;
        for (int i = 0; i < cnt; i++) if (ts[i] >= t0 && ts[i] <= t1) {
            if (tv[i] < tmin) { tmin = tv[i]; iMin = i; }
            if (tv[i] > tmax) { tmax = tv[i]; iMax = i; }
        }
        if (iMin < 0) {
            pt.setTextSize(12 * d); pt.setColor(muted);
            cv.drawText("Daten werden geladen …", pad, Math.max(top + 30 * d, h / 2f), pt);
            return bmp;
        }

        // Flächen: Achsenbeschriftung links, Zeitachse unten, darunter die gewählten Zeilen
        float rowH = 13 * d, rowGap = 3 * d;
        int nRows = Integer.bitCount(rows & (ROW_SUN | ROW_RAIN | ROW_WIND));
        float extraH = nRows > 0 ? nRows * rowH + (nRows - 1) * rowGap + 6 * d : 0;
        float left = pad + 20 * d, right = w - pad - 4 * d;
        float plotTop = top + (place != null ? 30 : 16) * d, xLabel = h - 8 * d - extraH, plotBottom = xLabel - 14 * d;
        if (plotBottom - plotTop < 30 * d) plotTop = Math.max(top + 14 * d, plotBottom - 30 * d);
        double lo = Math.floor(tmin - 1), hi = Math.ceil(tmax + 1);
        if (hi - lo < 6) { double mid = (hi + lo) / 2; lo = Math.floor(mid - 3); hi = Math.ceil(mid + 3); }
        final float L = left, R = right, PT = plotTop, PB = plotBottom; final double LO = lo, HI = hi; final long T0 = t0, SPAN = hours * HOUR;
        Mapper m = new Mapper() {
            public float x(long t) { return L + (float) (t - T0) / SPAN * (R - L); }
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
            zp.setColor(0xFF4DABF7); zp.setStrokeWidth(Math.max(1, d)); zp.setPathEffect(new DashPathEffect(new float[] { 4 * d, 3 * d }, 0));
            cv.drawLine(left, m.y(0), right, m.y(0), zp);
        }
        // Tageswechsel (24/48 h): gestrichelte Linie, Wochentag oben
        if (hours > 12) {
            Paint dp = new Paint(Paint.ANTI_ALIAS_FLAG);
            dp.setColor(muted); dp.setStrokeWidth(Math.max(1, d)); dp.setPathEffect(new DashPathEffect(new float[] { 3 * d, 3 * d }, 0));
            pt.setTextSize(9.5f * d); pt.setTextAlign(Paint.Align.LEFT);
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(t0); c.set(Calendar.HOUR_OF_DAY, 0); c.add(Calendar.DAY_OF_MONTH, 1);
            for (; c.getTimeInMillis() < t1; c.add(Calendar.DAY_OF_MONTH, 1)) {
                float x = m.x(c.getTimeInMillis());
                cv.drawLine(x, plotTop - 12 * d, x, plotBottom, dp);
                cv.drawText(WD[c.get(Calendar.DAY_OF_WEEK) - 1], x + 3 * d, plotTop - 4 * d, pt);
            }
        }
        // Zeitachse: 12 h alle 3, 24 h alle 6, 48 h alle 12 Stunden
        long tick = hours / 4 * HOUR;
        pt.setTextSize(10 * d);
        for (long t = t0; t <= t1; t += tick) {
            float x = m.x(t);
            cv.drawLine(x, plotTop, x, plotBottom, gp);
            String lbl = t == t0 ? "jetzt" : hourOf(t) + " Uhr";
            pt.setTextAlign(t == t0 ? Paint.Align.LEFT : t == t1 ? Paint.Align.RIGHT : Paint.Align.CENTER);
            cv.drawText(lbl, t == t0 ? x - 4 * d : x, xLabel, pt);
        }

        // Kurve: geglättet wie curve() in app.js, darunter Fläche mit Verlauf
        Path line = new Path();
        float fx = 0, lx = 0, px = 0, py = 0; boolean first = true;
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
        lp.setStyle(Paint.Style.STROKE); lp.setColor(TEMP); lp.setStrokeWidth((hours > 24 ? 2.2f : 2.6f) * d);
        lp.setStrokeCap(Paint.Cap.ROUND); lp.setStrokeJoin(Paint.Join.ROUND);
        cv.drawPath(line, lp);
        cv.restore();

        // Werte: 12 h an den Achsenpunkten sowie Tiefst- und Höchstwert (ein Extremwert nahe einem Achsenpunkt ersetzt diesen);
        // 24/48 h wie app.js je Tag Höchstwert am Nachmittag (11–17 Uhr) und Tiefstwert in der Nacht (2–8 Uhr), dazu „jetzt“
        boolean[] show = new boolean[cnt];
        boolean[] low = new boolean[cnt];
        if (hours <= 12) {
            for (int i = 0; i < cnt; i++) show[i] = ts[i] >= t0 && ts[i] <= t1 && (ts[i] - t0) % tick == 0;
            for (int e : new int[] { iMin, iMax }) {
                for (int i = 0; i < cnt; i++) if (show[i] && i != e && Math.abs(ts[i] - ts[e]) <= tick / 3) show[i] = false;
                show[e] = true;
            }
            low[iMin] = iMin != iMax;
        } else {
            Calendar c = Calendar.getInstance();
            int aftI = -1, nightI = -1, day = -1;
            for (int i = 0; i <= cnt; i++) {
                int dd = -2, hr = -1;
                if (i < cnt) { c.setTimeInMillis(ts[i]); dd = c.get(Calendar.DAY_OF_YEAR); hr = c.get(Calendar.HOUR_OF_DAY); }
                if (dd != day) {   // Tag abgeschlossen: dessen Extremwerte zeigen
                    if (aftI >= 0) show[aftI] = true;
                    if (nightI >= 0) { show[nightI] = true; low[nightI] = true; }
                    aftI = nightI = -1; day = dd;
                }
                if (i == cnt || ts[i] < t0 || ts[i] > t1) continue;
                if (hr >= 11 && hr <= 17 && (aftI < 0 || tv[i] > tv[aftI])) aftI = i;
                if (hr >= 2 && hr <= 8 && (nightI < 0 || tv[i] < tv[nightI])) nightI = i;
            }
            for (int i = 0; i < cnt; i++) if (ts[i] == t0) {   // „jetzt“, wenn kein Tageswert direkt daneben steht
                boolean near = false;
                for (int k = 0; k < cnt; k++) if (show[k] && Math.abs(ts[k] - t0) <= Math.max(3 * HOUR, tick / 2)) near = true;
                if (!near) show[i] = true;
            }
        }
        Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        dot.setColor(dark ? 0xFF18212B : 0xFF1C2733);
        ring.setStyle(Paint.Style.STROKE); ring.setColor(TEMP); ring.setStrokeWidth(2 * d);
        pt.setTextSize(11 * d); pt.setColor(text); pt.setFakeBoldText(true); pt.setTextAlign(Paint.Align.CENTER);
        for (int i = 0; i < cnt; i++) {
            if (!show[i]) continue;
            float x = m.x(ts[i]), y = m.y(tv[i]);
            cv.drawCircle(x, y, 3.5f * d, dot);
            cv.drawCircle(x, y, 3.5f * d, ring);
            float lxp = Math.min(Math.max(x, left + 10 * d), right - 8 * d);
            boolean below = low[i] && y - 20 * d < plotTop;
            cv.drawText(fmt(tv[i]) + "°", lxp, below ? y + 16 * d : y - 8 * d, pt);
        }
        pt.setFakeBoldText(false);
        if (nRows == 0) return bmp;

        // Zeilen: 12 Felder zu je hours/12 Stunden; Werte gelten wie in app.js für die Stunde vor dem Zeitstempel
        long bh = hours / 12 * HOUR;
        float cw = (right - left) / 12f, y = xLabel + 6 * d;
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), base = new Paint(Paint.ANTI_ALIAS_FLAG);
        base.setColor(grid); base.setStrokeWidth(Math.max(1, d));
        for (int row : new int[] { ROW_SUN, ROW_RAIN, ROW_WIND }) {
            if ((rows & row) == 0) continue;
            rowIcon(cv, row, left - 10 * d, y + rowH / 2, d, muted);
            for (int k = 0; k < 12; k++) {
                long a = t0 + k * bh, b = a + bh;
                double sSum = 0, pMax = Double.NaN, wSum = 0, u = 0, v = 0; int sN = 0, wN = 0;
                for (int i = 0; i < cnt; i++) {
                    if (ts[i] <= a || ts[i] > b) continue;
                    if (!Double.isNaN(sun[i])) { sSum += sun[i]; sN++; }
                    if (!Double.isNaN(prob[i])) pMax = Double.isNaN(pMax) ? prob[i] : Math.max(pMax, prob[i]);
                    if (!Double.isNaN(wind[i])) {
                        wSum += wind[i]; wN++;
                        if (!Double.isNaN(dir[i])) { u += wind[i] * Math.sin(Math.toRadians(dir[i])); v += wind[i] * Math.cos(Math.toRadians(dir[i])); }
                    }
                }
                float x0 = left + k * cw + 1.5f * d, x1 = left + (k + 1) * cw - 1.5f * d, cx = (x0 + x1) / 2;
                if (row == ROW_SUN) {
                    cv.drawLine(x0, y + rowH, x1, y + rowH, base);
                    double frac = sN > 0 ? Math.min(1, sSum / (bh / 60000.0)) : 0;
                    if (sSum >= 1) {
                        fill.setColor(SUN);
                        float bhPx = Math.max(2 * d, (float) frac * rowH);
                        cv.drawRoundRect(new RectF(x0, y + rowH - bhPx, x1, y + rowH), 2 * d, 2 * d, fill);
                    }
                } else if (row == ROW_RAIN && !Double.isNaN(pMax)) {
                    int pc = (int) Math.round(pMax);
                    fill.setColor(RAIN); fill.setAlpha((int) Math.round(255 * (0.08 + 0.8 * pc / 100.0)));
                    cv.drawRoundRect(new RectF(x0, y, x1, y + rowH), 2.5f * d, 2.5f * d, fill);
                    if (cw >= 15 * d) {
                        pt.setTextSize(8.5f * d); pt.setTextAlign(Paint.Align.CENTER); pt.setColor(pc >= 55 ? 0xFFFFFFFF : text);
                        cv.drawText(String.valueOf(pc), cx, y + rowH - 3.5f * d, pt);
                    }
                } else if (row == ROW_WIND && wN > 0) {
                    double spd = wSum / wN;
                    int col = spd >= 50 ? 0xFFE8590C : text;
                    String num = String.valueOf(Math.round(spd));
                    pt.setTextSize(8.5f * d); pt.setColor(col); pt.setTextAlign(Paint.Align.LEFT);
                    float tw = pt.measureText(num), aw = 7 * d, gap = 1.5f * d;
                    boolean arrow = u != 0 || v != 0, room = cw >= tw + aw + gap + 2 * d;
                    float start = cx - ((arrow && room ? aw + gap : 0) + tw) / 2;
                    if (arrow && room) {
                        // Pfeil in Zugrichtung: Windrichtung gibt an, woher der Wind kommt → um 180° gedreht
                        double to = Math.toDegrees(Math.atan2(u, v)) + 180;
                        arrow(cv, start + aw / 2, y + rowH / 2, aw / 2, to, col);
                        start += aw + gap;
                    }
                    cv.drawText(num, start, y + rowH - 3.5f * d, pt);
                }
            }
            y += rowH + rowGap;
        }
        return bmp;
    }

    /** Pfeil um (cx, cy) mit Radius r, zeigt in Richtung deg (0 = Nord/oben, im Uhrzeigersinn). */
    private static void arrow(Canvas cv, float cx, float cy, float r, double deg, int color) {
        double a = Math.toRadians(deg);
        float sx = (float) Math.sin(a), sy = (float) -Math.cos(a), ox = -sy, oy = sx;
        Path p = new Path();
        p.moveTo(cx + sx * r, cy + sy * r);                                        // Spitze
        p.lineTo(cx - sx * r + ox * r * 0.75f, cy - sy * r + oy * r * 0.75f);
        p.lineTo(cx - sx * r * 0.45f, cy - sy * r * 0.45f);
        p.lineTo(cx - sx * r - ox * r * 0.75f, cy - sy * r - oy * r * 0.75f);
        p.close();
        Paint f = new Paint(Paint.ANTI_ALIAS_FLAG);
        f.setColor(color);
        cv.drawPath(p, f);
    }

    /** Kennzeichen links vor der Zeile: Sonne, Regentropfen, Wind. */
    private static void rowIcon(Canvas cv, int row, float ix, float iy, float d, int muted) {
        Paint ic = new Paint(Paint.ANTI_ALIAS_FLAG);
        if (row == ROW_SUN) {
            ic.setColor(SUN);
            cv.drawCircle(ix, iy, 3.2f * d, ic);
            ic.setStrokeWidth(1.2f * d);
            for (int k = 0; k < 8; k++) {
                double an = Math.PI / 4 * k;
                cv.drawLine(ix + (float) Math.cos(an) * 4.6f * d, iy + (float) Math.sin(an) * 4.6f * d,
                    ix + (float) Math.cos(an) * 6.2f * d, iy + (float) Math.sin(an) * 6.2f * d, ic);
            }
        } else if (row == ROW_RAIN) {
            ic.setColor(RAIN);
            Path drop = new Path();
            drop.moveTo(ix, iy - 5.5f * d);
            drop.cubicTo(ix + 4.5f * d, iy, ix + 4 * d, iy + 4.5f * d, ix, iy + 4.5f * d);
            drop.cubicTo(ix - 4 * d, iy + 4.5f * d, ix - 4.5f * d, iy, ix, iy - 5.5f * d);
            cv.drawPath(drop, ic);
        } else {   // Wind: drei Linien, die oberste mit Bogen
            ic.setColor(muted); ic.setStyle(Paint.Style.STROKE); ic.setStrokeWidth(1.4f * d); ic.setStrokeCap(Paint.Cap.ROUND);
            Path p = new Path();
            p.moveTo(ix - 6 * d, iy - 3 * d); p.lineTo(ix + 2 * d, iy - 3 * d);
            p.cubicTo(ix + 6 * d, iy - 3 * d, ix + 6 * d, iy - 8 * d, ix + 2.5f * d, iy - 7 * d);
            p.moveTo(ix - 6 * d, iy + 0.5f * d); p.lineTo(ix + 5 * d, iy + 0.5f * d);
            p.moveTo(ix - 6 * d, iy + 4 * d); p.lineTo(ix + 1 * d, iy + 4 * d);
            cv.drawPath(p, ic);
        }
    }

    private interface Mapper { float x(long t); float y(double v); }

    private static double opt(JSONObject r, String k) { return r.isNull(k) ? Double.NaN : r.optDouble(k, Double.NaN); }

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

    private static String fmt(double v) {
        long r = Math.round(v);
        return r == 0 ? "0" : String.valueOf(r);   // im Diagramm „0°“ statt „-0°“
    }

    private static String ellipsize(Paint p, String s, float max) {
        if (p.measureText(s) <= max) return s;
        while (s.length() > 1 && p.measureText(s + "…") > max) s = s.substring(0, s.length() - 1);
        return s + "…";
    }
}
