package de.regenradar.wetter;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.ClipData;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.JsPromptResult;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hülle für die Wetter-PWA: die Web-Dateien liegen in assets/www und werden unter
 * https://appassets.androidplatform.net/ ausgeliefert (sicherer Kontext für GPS und Service Worker).
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    // Ort, den ein angetipptes Widget zeigt – die App öffnet ihn statt des aktuellen Standorts
    static final String EXTRA_LAT = "placeLat", EXTRA_LON = "placeLon", EXTRA_NAME = "placeName";
    private static final int REQ_LOCATION = 1, REQ_NOTIFY = 2;
    private static final String BRIDGE = "wetterapp:";
    // Zurück-Taste: erst offenen Dialog schließen, dann Vollbild-Karte beenden (window.appBack), sonst zurück bzw. beenden
    private static final String JS_BACK = "(()=>{const d=[...document.querySelectorAll('dialog[open]')].pop();"
        + "if(!d)return !!(window.appBack&&window.appBack());"
        + "if(d.dispatchEvent(new Event('cancel',{cancelable:true})))d.close();return true})()";

    private WebView web;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Kennung für app.js (NATIVE): Benachrichtigungen laufen dann über die Brücke unten
        s.setUserAgentString(s.getUserAgentString() + " WetterApp-Android/" + versionName());

        ServiceWorkerController swc = ServiceWorkerController.getInstance();
        swc.getServiceWorkerWebSettings().setAllowFileAccess(false);
        swc.getServiceWorkerWebSettings().setAllowContentAccess(false);
        swc.setServiceWorkerClient(new ServiceWorkerClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebResourceRequest req) {
                return serveAsset(req.getUrl());
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return serveAsset(req.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                openExternal(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (hasLocationPermission()) { cb.invoke(origin, true, false); return; }
                geoOrigin = origin;
                geoCallback = cb;
                requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOCATION);
            }

            // Brücke zu app.js: prompt('wetterapp:' + JSON-Array [Befehl, ...Argumente]) – nur von der eigenen Herkunft
            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String def, JsPromptResult result) {
                if (message == null || !message.startsWith(BRIDGE)) return false;
                if (!HOST.equals(Uri.parse(url).getHost())) { result.cancel(); return true; }
                try { result.confirm(bridge(new JSONArray(message.substring(BRIDGE.length())))); }
                catch (JSONException e) { result.cancel(); }
                return true;
            }
        });

        Intent in = getIntent();
        if (in != null && in.hasExtra(EXTRA_LAT)) web.loadUrl(START + "?place=" + Uri.encode(in.getDoubleExtra(EXTRA_LAT, 0) + ","
            + in.getDoubleExtra(EXTRA_LON, 0)) + "&name=" + Uri.encode(String.valueOf(in.getStringExtra(EXTRA_NAME))));
        else if (state != null) web.restoreState(state);
        else web.loadUrl(START);
        // Wecker und Hintergrundprüfung bei jedem Start neu stellen – manche Hersteller löschen sie beim Schließen der App
        DailyAlarm.schedule(this);
        CheckService.update(this);
    }

    private String bridge(JSONArray a) throws JSONException {
        switch (a.getString(0)) {
            case "permission":
                return JSONObject.quote(notifyPermission());
            case "shareBegin":   // Bild der Karte anlegen: {w, h} in CSS-Pixeln, file, text
                return String.valueOf(shareBegin(a.getJSONObject(1)));
            case "sharePart": {  // sichtbaren Teil kopieren: {x, y, w, h} im Fenster, dy = Lage in der Karte; Ergebnis per __sharePart
                final JSONObject r = a.getJSONObject(1);
                web.post(new Runnable() { @Override public void run() { sharePart(r); } });
                return "true";
            }
            case "shareEnd":
                web.post(new Runnable() { @Override public void run() { shareEnd(); } });
                return "true";
            case "requestPermission":
                if (Notifier.allowed(this) || Build.VERSION.SDK_INT < 33) permissionResult();
                else requestPermissions(new String[] { Notifier.POST_NOTIFICATIONS }, REQ_NOTIFY);
                return "null";
            case "dailyTest": {   // Tagesvorhersage sofort senden; Ergebnis per window.__dailyTest(text)
                final boolean evening = a.optBoolean(1, true);
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        String msg;
                        try { DailyForecast.runLogged(getApplicationContext(), evening); msg = "Tagesvorhersage gesendet."; }
                        catch (Exception e) { msg = "Tagesvorhersage fehlgeschlagen: " + DailyForecast.reason(e); }
                        final String js = "window.__dailyTest && window.__dailyTest(" + JSONObject.quote(msg) + ")";
                        runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
                    }
                }).start();
                return "null";
            }
            case "frostTest": {   // Frost-/Glättemeldung sofort prüfen und senden; Ergebnis per window.__dailyTest(text)
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        String msg;
                        try { FrostAlert.runLogged(getApplicationContext(), true); msg = "Frost-/Glättemeldung gesendet."; }
                        catch (Exception e) { msg = "Frost-/Glättemeldung fehlgeschlagen: " + DailyForecast.reason(e); }
                        final String js = "window.__dailyTest && window.__dailyTest(" + JSONObject.quote(msg) + ")";
                        runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
                    }
                }).start();
                return "null";
            }
            case "dailyStatus": {
                SharedPreferences p = Notifier.prefs(this);
                JSONObject o = new JSONObject().put("exact", DailyAlarm.exactAllowed(this)).put("xiaomi", isXiaomi());
                for (String k : new String[] { "dailyEve", "dailyMorn", "frostNotify" })
                    o.put(k, new JSONObject().put("next", p.getLong(k + "Next", 0)).put("lastAt", p.getLong(k + "LastAt", 0)).put("last", p.getString(k + "Last", "")));
                return o.toString();
            }
            case "openSettings":   // "autostart" (Xiaomi) oder App-Details (Akku, Berechtigungen)
                openSettings("autostart".equals(a.optString(1)));
                return "null";
            case "notify":
                return String.valueOf(Notifier.show(this, a.getString(1), a.getString(2), a.getString(3)));
            case "sync": {
                JSONObject o = a.getJSONObject(1);
                SharedPreferences p = Notifier.prefs(this);
                long oldLat = p.getLong("lat", 0), oldLon = p.getLong("lon", 0);
                // Favoriten und zuletzt per GPS ermittelter Ort – Widgets können darauf eingestellt sein
                String favs = o.has("favs") ? o.optJSONArray("favs").toString() : "[]";
                String gps = o.isNull("gpsLoc") ? "null" : o.optJSONObject("gpsLoc").toString();
                boolean placesChanged = !favs.equals(p.getString("favs", "[]")) || !gps.equals(p.getString("gpsLoc", "null"));
                SharedPreferences.Editor e = p.edit()
                    .putBoolean("notify", o.optBoolean("notify"))
                    .putBoolean("warnNotify", o.optBoolean("warnNotify"))
                    .putString("name", o.optString("name", ""))
                    .putString("theme", o.optString("theme", "system"))
                    .putString("favs", favs)
                    .putString("gpsLoc", gps)
                    .putInt("rainRadius", o.optInt("rainRadius", 10))
                    .putString("rainMin", o.optString("rainMin", "all"))
                    .putBoolean("stormNotify", o.optBoolean("stormNotify"))
                    .putInt("stormRadius", o.optInt("stormRadius", 50))
                    .putBoolean("dailyEve", o.optBoolean("dailyEve"))
                    .putString("dailyEveTime", o.optString("dailyEveTime", "20:00"))
                    .putBoolean("frostNotify", o.optBoolean("frostNotify"))
                    .putString("frostTime", o.optString("frostTime", "20:00"))
                    .putBoolean("dailyMorn", o.optBoolean("dailyMorn"))
                    .putString("dailyMornTime", o.optString("dailyMornTime", "06:30"));
                JSONObject dp = o.optJSONObject("dailyPlace");   // Ort der Tagesvorhersage (zuletzt per GPS oder Favorit)
                if (dp != null && !dp.isNull("lat")) e.putLong("dailyLat", Double.doubleToLongBits(dp.getDouble("lat")))
                    .putLong("dailyLon", Double.doubleToLongBits(dp.getDouble("lon"))).putString("dailyName", dp.optString("name", ""));
                else e.remove("dailyLat").remove("dailyLon");
                boolean moved;
                if (o.isNull("lat") || o.isNull("lon")) { e.remove("lat").remove("lon"); moved = false; }
                else {
                    long lat = Double.doubleToLongBits(o.getDouble("lat")), lon = Double.doubleToLongBits(o.getDouble("lon"));
                    moved = lat != oldLat || lon != oldLon;
                    e.putLong("lat", lat).putLong("lon", lon);
                }
                e.apply();
                CheckService.update(this);
                DailyAlarm.schedule(this);
                if (Widgets.any(this)) {
                    Widgets.render(this);                  // Ortsname, Hell/Dunkel sofort
                    if (moved || placesChanged) CheckService.runSoon(this);   // neuer Ort: frische Daten holen
                }
                return "null";
            }
            default:
                return "null";
        }
    }

    private static boolean isXiaomi() {
        String m = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase(java.util.Locale.ROOT);
        return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco");
    }

    private void openSettings(boolean autostart) {
        if (autostart && isXiaomi()) {
            try {
                startActivity(new Intent().setComponent(new android.content.ComponentName("com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity")));
                return;
            } catch (Exception ignored) { }   // andere HyperOS-Version: App-Details als Rückfall
        }
        try { startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
        catch (Exception ignored) { }
    }

    /** Wie Notification.permission: "granted", "denied" oder "default" (noch nicht gefragt). */
    private String notifyPermission() {
        if (Notifier.allowed(this)) return "granted";
        if (Build.VERSION.SDK_INT >= 33 && !Notifier.prefs(this).getBoolean("notifyAsked", false)) return "default";
        return "denied";
    }

    private void permissionResult() {
        web.evaluateJavascript("window.__wetterPerm && window.__wetterPerm(" + JSONObject.quote(notifyPermission()) + ")", null);
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException e) { return "0"; }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_NOTIFY) {
            Notifier.prefs(this).edit().putBoolean("notifyAsked", true).apply();
            permissionResult();
            return;
        }
        if (code != REQ_LOCATION || geoCallback == null) return;
        geoCallback.invoke(geoOrigin, hasLocationPermission(), false);
        geoCallback = null;
        geoOrigin = null;
    }

    private void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); }
        catch (ActivityNotFoundException ignored) { }
    }

    private WebResourceResponse serveAsset(Uri u) {
        if (!"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) return notFound();
        try {
            InputStream in = getAssets().open("www" + path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime(path), mime(path).startsWith("text/") || path.endsWith(".js")
                ? "utf-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        // dx kann keine Lambdas (invokedynamic) für minSdk 24 übersetzen
        web.evaluateJavascript(JS_BACK, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String closed) {
                if ("true".equals(closed)) return;
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /*
     * Karte teilen: app.js scrollt die Karte abschnittsweise ins Bild; jeder sichtbare Abschnitt wird per PixelCopy aus den
     * Bildschirmpixeln kopiert (zeigt genau, was auf dem Bildschirm steht, samt Karte und Diagrammen) und in ein Bild der
     * ganzen Karte eingesetzt. WebView.draw() liefert bei Hardware-Beschleunigung oft einen veralteten oder leeren Stand
     * und dient nur als Ersatz unter Android 8.
     */
    private Bitmap shareBmp;
    private JSONObject shareMeta;

    private float cssPx() { return getResources().getDisplayMetrics().density; }   // CSS-Pixel → Bildschirmpixel

    private boolean shareBegin(JSONObject r) {
        try {
            float d = cssPx();
            int w = Math.round((float) r.getDouble("w") * d), h = Math.min(Math.round((float) r.getDouble("h") * d), 6000);
            if (w < 10 || h < 10) return false;
            if (shareBmp != null) shareBmp.recycle();
            shareBmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            shareMeta = r;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void sharePart(JSONObject r) {
        try {
            if (shareBmp == null) throw new IllegalStateException("kein Bild angelegt");
            float d = cssPx();
            int x = Math.max(0, Math.round((float) r.getDouble("x") * d)), y = Math.max(0, Math.round((float) r.getDouble("y") * d));
            int w = Math.min(Math.min(web.getWidth() - x, shareBmp.getWidth()), Math.round((float) r.getDouble("w") * d));
            int h = Math.min(web.getHeight() - y, Math.round((float) r.getDouble("h") * d));
            final int dy = Math.round((float) r.getDouble("dy") * d);
            if (w < 1 || h < 1 || dy >= shareBmp.getHeight()) { partDone(null); return; }
            final Bitmap part = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            if (Build.VERSION.SDK_INT >= 26) {
                int[] at = new int[2];
                web.getLocationInWindow(at);   // Lage der WebView im Fenster (Statusleiste usw.)
                android.graphics.Rect src = new android.graphics.Rect(at[0] + x, at[1] + y, at[0] + x + w, at[1] + y + h);
                android.view.PixelCopy.request(getWindow(), src, part, new android.view.PixelCopy.OnPixelCopyFinishedListener() {
                    @Override
                    public void onPixelCopyFinished(int result) {
                        if (result == android.view.PixelCopy.SUCCESS) { place(part, dy); partDone(null); }
                        else partDone("Bild konnte nicht aufgenommen werden (" + result + ")");
                    }
                }, new android.os.Handler(android.os.Looper.getMainLooper()));
            } else {
                Canvas cv = new Canvas(part);
                cv.translate(-x, -y);
                web.draw(cv);
                place(part, dy);
                partDone(null);
            }
        } catch (Exception e) {
            partDone(String.valueOf(e.getMessage()));
        }
    }

    private void place(Bitmap part, int dy) {
        new Canvas(shareBmp).drawBitmap(part, 0, dy, null);
        part.recycle();
    }

    private void partDone(String err) {
        web.evaluateJavascript("window.__sharePart && window.__sharePart(" + (err == null ? "null" : JSONObject.quote(err)) + ")", null);
    }

    private void shareEnd() {
        if (shareBmp == null) { shareFailed("kein Bild angelegt"); return; }
        Bitmap b = shareBmp;
        shareBmp = null;
        sendImage(b, shareMeta);
    }

    private void sendImage(Bitmap card, JSONObject r) {
        try {
            File dir = ShareProvider.dir(this);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cache nicht beschreibbar");
            String name = r.optString("file", "wetter") + ".png";
            if (!name.matches("[A-Za-z0-9_-]+\\.png")) name = "wetter.png";
            FileOutputStream out = new FileOutputStream(new File(dir, name));
            try { card.compress(Bitmap.CompressFormat.PNG, 100, out); } finally { out.close(); }
            card.recycle();
            Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + name);
            Intent send = new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String text = r.optString("text", "");
            if (!text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.setClipData(ClipData.newRawUri(name, uri));   // Leseberechtigung auch für das Vorschaubild im Teilen-Menü
            startActivity(Intent.createChooser(send, "Wetter teilen"));
        } catch (Exception e) {
            shareFailed(e.getMessage());
        }
    }

    private void shareFailed(String msg) {
        web.evaluateJavascript("window.__shareFailed && window.__shareFailed(" + JSONObject.quote(String.valueOf(msg)) + ")", null);
    }

    @Override
    protected void onNewIntent(Intent in) {
        super.onNewIntent(in);
        setIntent(in);
        if (!in.hasExtra(EXTRA_LAT)) return;
        web.evaluateJavascript("window.showPlace && window.showPlace(" + in.getDoubleExtra(EXTRA_LAT, 0) + "," + in.getDoubleExtra(EXTRA_LON, 0)
            + "," + JSONObject.quote(String.valueOf(in.getStringExtra(EXTRA_NAME))) + ")", null);
    }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
