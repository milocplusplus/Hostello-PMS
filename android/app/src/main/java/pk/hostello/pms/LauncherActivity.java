/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package pk.hostello.pms;

import android.Manifest;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.core.content.ContextCompat;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final int POST_NOTIFICATIONS_REQUEST = 4001;

    /**
     * Chrome only prompts for the Android notification permission when the site
     * asks for its own — and by then the site has usually been granted it in the
     * browser already, so the app never gets asked and Chrome ends up showing
     * the notifications itself. Asking here, on the first launch that needs it,
     * is what keeps delegation working: without POST_NOTIFICATIONS the
     * DelegationService reports notifications as disabled and Chrome falls back.
     */
    private boolean mAwaitingNotificationPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        if (mAwaitingNotificationPermission) {
            requestPermissions(
                    new String[] {Manifest.permission.POST_NOTIFICATIONS},
                    POST_NOTIFICATIONS_REQUEST);
        }
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        // Holding the launch back is the only way the permission dialog gets a
        // screen to itself; the TWA is started again the moment it is answered.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            mAwaitingNotificationPermission = true;
            return false;
        }
        return super.shouldLaunchImmediately();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
            int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != POST_NOTIFICATIONS_REQUEST) return;
        // Granted or not, the app still has to open. Android answers this itself
        // once the user has declined twice, so a refusal costs one frame.
        mAwaitingNotificationPermission = false;
        launchTwa();
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();

        

        return uri;
    }
}
