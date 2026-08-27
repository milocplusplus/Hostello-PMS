package pk.hostello.pms;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

/**
 * Notification delegation.
 *
 * Chrome hands every web notification for the site to this service, so the
 * banner comes from Hostello — its name, its icon (ic_notification_icon, wired
 * to this service in the manifest) — instead of from Chrome.
 *
 * The one thing the inherited implementation gets wrong for us is importance:
 * it creates the channel at IMPORTANCE_DEFAULT, which drops the notification
 * straight into the shade with no banner. A booking landing is worth a heads-up
 * banner, a sound and a lit screen, so we post on our own IMPORTANCE_HIGH
 * channel instead. Importance is fixed when the channel is first created and
 * belongs to the user afterwards — bump CHANNEL_ID if this default ever has to
 * change again, or existing installs keep the old one.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    private static final String CHANNEL_ID = "hostello_alerts_v1";
    private static final String CHANNEL_NAME = "Hostello alerts";

    @Override
    public void onCreate() {
        super.onCreate();
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            Notification notification, String channelName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // No channels before Oreo; the inherited path already posts at the
            // priority Chrome set.
            return super.onNotifyNotificationWithChannel(
                    platformTag, platformId, notification, channelName);
        }

        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return false;

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Bookings, blocks and payouts");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.enableLights(true);
        // A no-op once the channel exists, which is what keeps the user's own
        // settings from being reset on every notification.
        manager.createNotificationChannel(channel);

        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing == null || existing.getImportance() == NotificationManager.IMPORTANCE_NONE) {
            return false;
        }

        manager.notify(platformTag, platformId,
                Notification.Builder.recoverBuilder(this, notification)
                        .setChannelId(CHANNEL_ID)
                        .build());
        return true;
    }
}
