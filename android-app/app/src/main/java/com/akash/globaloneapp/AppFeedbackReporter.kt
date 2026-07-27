package com.akash.globaloneapp

import android.app.Activity
import android.os.Build
import android.widget.Toast
import org.json.JSONObject
import java.time.Instant

object AppFeedbackReporter {
    @Volatile var lastAction: String = "Unknown action"

    fun send(activity: Activity, errorMessage: String, onComplete: (Boolean, String) -> Unit) {
        val session = SessionManager(activity)
        val payload = JSONObject().apply {
            put("action", "submitAppFeedback")
            put("employeeId", session.getEmployeeId())
            put("androidId", DeviceUtils.getAndroidId(activity))
            put("errorMessage", errorMessage)
            put("screen", activity.localClassName.substringAfterLast('.'))
            put("actionAttempted", lastAction)
            put("appVersion", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
            put("occurredAt", Instant.now().toString())
        }
        ApiClient.post(payload) { success, message, _ ->
            activity.runOnUiThread {
                Toast.makeText(activity, message.ifBlank { if (success) "Feedback sent to Admin." else "Feedback could not be sent." }, Toast.LENGTH_LONG).show()
                onComplete(success, message)
            }
        }
    }
}
