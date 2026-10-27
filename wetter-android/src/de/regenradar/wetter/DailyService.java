package de.regenradar.wetter;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.PersistableBundle;

/** Zweiter Versuch für die Tagesvorhersage, sobald Netz da ist – höchstens 3 Stunden nach dem geplanten Zeitpunkt. */
public class DailyService extends JobService {
    private static final long MAX_LATE = 3 * 3600000L;

    static void retry(Context c, boolean evening) {
        PersistableBundle extras = new PersistableBundle();
        extras.putBoolean("evening", evening);
        extras.putLong("due", System.currentTimeMillis());
        c.getSystemService(JobScheduler.class).schedule(new JobInfo.Builder(evening ? 20 : 21, new ComponentName(c, DailyService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setMinimumLatency(60 * 1000L)
            .setExtras(extras)
            .build());
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final PersistableBundle x = params.getExtras();
        if (System.currentTimeMillis() - x.getLong("due", 0) > MAX_LATE) return false;   // zu spät, nicht mehr sinnvoll
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean failed = false;
                try { DailyForecast.run(getApplicationContext(), x.getBoolean("evening", true)); }
                catch (Exception e) { failed = true; }
                jobFinished(params, failed && System.currentTimeMillis() - x.getLong("due", 0) < MAX_LATE);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }
}
