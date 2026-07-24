package com.akash.globaloneapp

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject

object PushNotifications {
    private const val REQUEST_NOTIFICATIONS = 701

    fun activate(activity: Activity, session: SessionManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
        }
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (token.isBlank() || !session.hasRememberedLogin()) return@addOnSuccessListener
            ApiClient.post(
                JSONObject().put("action", "registerPushToken")
                    .put("employeeId", session.getEmployeeId())
                    .put("androidId", DeviceUtils.getAndroidId(activity))
                    .put("pushToken", token)
            ) { _, _, _ -> }
        }
    }
}
