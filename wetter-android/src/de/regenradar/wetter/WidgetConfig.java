package de.regenradar.wetter;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Einrichten eines Widgets beim Hinzufügen und über „Widget bearbeiten“ (reconfigurable):
 * 1. Ort – Mein Standort (zuletzt per GPS), Ort aus der App oder ein Favorit;
 * 2. bei Diagramm-Widgets der Zeitraum (12, 24 oder 48 Stunden).
 */
public class WidgetConfig extends Activity {
    private static final int[] HOURS = { 12, 24, 48 };
    private int id;
    private Intent result;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        setResult(RESULT_CANCELED, result);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        askPlace();
    }

    private void askPlace() {
        final SharedPreferences p = Notifier.prefs(this);
        final List<String> keys = new ArrayList<>(), labels = new ArrayList<>();
        JSONObject gps = null;
        try { gps = new JSONObject(p.getString("gpsLoc", "null")); } catch (Exception ignored) { }
        String app = p.getString("name", "");
        keys.add("gps");
        labels.add(gps != null ? "Mein Standort (zuletzt per GPS: " + gps.optString("name") + ")" : "Mein Standort (noch kein GPS – bis dahin der Ort aus der App)");
        keys.add("app");
        labels.add("Ort aus der App" + (app.isEmpty() ? "" : " (zurzeit " + app + ")"));
        try {
            JSONArray favs = new JSONArray(p.getString("favs", "[]"));
            for (int i = 0; i < favs.length(); i++) {
                keys.add("fav:" + favs.getJSONObject(i).optString("id"));
                labels.add("★ " + favs.getJSONObject(i).optString("name"));
            }
        } catch (Exception ignored) { }
        // neu: Mein Standort vorgewählt; beim Bearbeiten die bisherige Wahl
        String cur = p.getString("widgetLoc_" + id, "gps");
        int sel = Math.max(0, keys.indexOf(cur));
        new AlertDialog.Builder(this)
            .setTitle("Wetter für welchen Ort?")
            .setSingleChoiceItems(labels.toArray(new String[0]), sel, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dlg, int which) {
                    p.edit().putString("widgetLoc_" + id, keys.get(which)).apply();
                    dlg.dismiss();
                    if (isChart()) askHours(); else done();
                }
            })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override
                public void onCancel(DialogInterface dlg) { finish(); }
            })
            .show();
    }

    private boolean isChart() {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id);
        String cls = info != null ? info.provider.getClassName() : "";
        return cls.endsWith(".WidgetChart") || cls.endsWith(".WidgetChartPlus") || cls.endsWith(".WidgetCombo");
    }

    private void askHours() {
        int cur = Widgets.hours(this, id), sel = 0;
        for (int i = 0; i < HOURS.length; i++) if (HOURS[i] == cur) sel = i;
        new AlertDialog.Builder(this)
            .setTitle("Zeitraum des Diagramms")
            .setSingleChoiceItems(new String[] { "12 Stunden", "24 Stunden", "48 Stunden" }, sel, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dlg, int which) {
                    Notifier.prefs(WidgetConfig.this).edit().putInt("chartHours_" + id, HOURS[which]).apply();
                    dlg.dismiss();
                    done();
                }
            })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override
                public void onCancel(DialogInterface dlg) { done(); }   // Ort ist schon gewählt; Zeitraum bleibt
            })
            .show();
    }

    private void done() {
        Widgets.render(this);
        CheckService.update(this);
        CheckService.runSoon(this);   // Daten für den gewählten Ort bzw. Zeitraum holen
        setResult(RESULT_OK, result);
        finish();
    }
}
