package de.regenradar.wetter;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget groß (4×3) – Logik in {@link Widgets}. */
public class WidgetLarge extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        Widgets.render(c);           // sofort mit dem letzten Stand
        CheckService.update(c);      // regelmäßige Aktualisierung einplanen
        CheckService.runSoon(c);     // und gleich frische Daten holen
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) Notifier.prefs(c).edit().remove("widgetLoc_" + id).apply();
    }

    @Override
    public void onDisabled(Context c) {
        CheckService.update(c);      // letztes Widget entfernt – Prüfung ggf. beenden
    }
}
