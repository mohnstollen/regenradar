package de.regenradar.wetter;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Widget Temperaturverlauf 12 h – Bild aus {@link ChartImage}, Daten und Zeichnen in {@link Widgets}. */
public class WidgetChart extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        Widgets.render(c);           // sofort mit dem letzten Stand
        CheckService.update(c);      // regelmäßige Aktualisierung einplanen
        CheckService.runSoon(c);     // und gleich frische Daten holen
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager mgr, int id, Bundle options) {
        Widgets.render(c);           // Größe geändert: Diagramm passend neu zeichnen
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) Notifier.prefs(c).edit().remove("chartHours_" + id).remove("widgetLoc_" + id).apply();
    }

    @Override
    public void onDisabled(Context c) {
        CheckService.update(c);
    }
}
