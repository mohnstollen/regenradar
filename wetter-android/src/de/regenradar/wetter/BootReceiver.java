package de.regenradar.wetter;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Nach Neustart, App-Update oder Zeitumstellung die Wecker der Tagesvorhersage neu stellen (nur geschützte Systemereignisse). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        DailyAlarm.schedule(c);
        CheckService.update(c);
    }
}
