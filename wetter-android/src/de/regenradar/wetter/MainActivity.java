package de.regenradar.wetter;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
    private static final int REQ_LOCATION = 1, REQ_NOTIFY = 2;
    private static final String BRIDGE = "wetterapp:";
    // Schließt den obersten offenen <dialog> wie die Escape-Taste; liefert true, wenn einer offen war
    private static final String JS_BACK = "(()=>{const d=[...document.querySelectorAll('dialog[open]')].pop();"
        + "if(!d)return false;if(d.dispatchEvent(new Event('cancel',{cancelable:true})))d.close();return true})()";

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

        if (state != null) web.restoreState(state);
        else web.loadUrl(START);
    }

    private String bridge(JSONArray a) throws JSONException {
        switch (a.getString(0)) {
            case "permission":
                return JSONObject.quote(notifyPermission());
            case "requestPermission":
                if (Notifier.allowed(this) || Build.VERSION.SDK_INT < 33) permissionResult();
                else requestPermissions(new String[] { Notifier.POST_NOTIFICATIONS }, REQ_NOTIFY);
                return "null";
            case "notify":
                return String.valueOf(Notifier.show(this, a.getString(1), a.getString(2), a.getString(3)));
            case "sync": {
                JSONObject o = a.getJSONObject(1);
                SharedPreferences p = Notifier.prefs(this);
                long oldLat = p.getLong("lat", 0), oldLon = p.getLong("lon", 0);
                SharedPreferences.Editor e = p.edit()
                    .putBoolean("notify", o.optBoolean("notify"))
                    .putBoolean("warnNotify", o.optBoolean("warnNotify"))
                    .putString("name", o.optString("name", ""))
                    .putString("theme", o.optString("theme", "system"));
                boolean moved;
                if (o.isNull("lat") || o.isNull("lon")) { e.remove("lat").remove("lon"); moved = false; }
                else {
                    long lat = Double.doubleToLongBits(o.getDouble("lat")), lon = Double.doubleToLongBits(o.getDouble("lon"));
                    moved = lat != oldLat || lon != oldLon;
                    e.putLong("lat", lat).putLong("lon", lon);
                }
                e.apply();
                CheckService.update(this);
                if (Widgets.any(this)) {
                    Widgets.render(this);                  // Ortsname, Hell/Dunkel sofort
                    if (moved) CheckService.runSoon(this); // neuer Ort: frische Daten holen
                }
                return "null";
            }
            default:
                return "null";
        }
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

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

    @Override
    protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
