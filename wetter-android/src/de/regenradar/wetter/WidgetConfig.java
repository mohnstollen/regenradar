package de.regenradar.wetter;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;

/**
 * Auswahl des Zeitraums (12, 24 oder 48 Stunden) beim Hinzufügen eines Diagramm-Widgets;
 * ab Android 12 auch später über „Widget bearbeiten“ (reconfigurable).
 */
public class WidgetConfig extends Activity {
    private static final int[] HOURS = { 12, 24, 48 };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        final int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        final Intent result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        setResult(RESULT_CANCELED, result);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        int cur = Widgets.hours(this, id), sel = 0;
        for (int i = 0; i < HOURS.length; i++) if (HOURS[i] == cur) sel = i;
        new AlertDialog.Builder(this)
            .setTitle("Zeitraum des Diagramms")
            .setSingleChoiceItems(new String[] { "12 Stunden", "24 Stunden", "48 Stunden" }, sel, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dlg, int which) {
                    Notifier.prefs(WidgetConfig.this).edit().putInt("chartHours_" + id, HOURS[which]).apply();
                    Widgets.render(WidgetConfig.this);
                    CheckService.update(WidgetConfig.this);
                    CheckService.runSoon(WidgetConfig.this);   // längerer Zeitraum braucht ggf. weitere Daten
                    setResult(RESULT_OK, result);
                    dlg.dismiss();
                    finish();
                }
            })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override
                public void onCancel(DialogInterface dlg) { finish(); }
            })
            .show();
    }
}
