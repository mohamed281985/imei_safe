package com.imeisafe.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NotificationSettings")
public class NotificationSettingsPlugin extends Plugin {

    @PluginMethod
    public void openAppNotificationSettings(PluginCall call) {
        Activity activity = getActivity();
        String packageName = activity.getPackageName();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent notificationSettingsIntent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName);
            try {
                activity.startActivity(notificationSettingsIntent);
                call.resolve();
                return;
            } catch (ActivityNotFoundException ignored) {
                // Use the app details screen when this Android version has no notification settings handler.
            }
        }

        Intent appDetailsIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", packageName, null));
        try {
            activity.startActivity(appDetailsIntent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("Unable to open app settings", error);
        }
    }
}