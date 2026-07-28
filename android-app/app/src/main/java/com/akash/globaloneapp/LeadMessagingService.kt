package com.akash.globaloneapp

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

class LeadMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        registerToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        if (message.data["type"] == "call_log_request") {
            Thread { submitCallLogStats(message.data["requestId"].orEmpty(), message.data["date"].orEmpty()) }.start()
            return
        }
        if (message.data["type"] == "app_update") {
            val title = message.data["title"] ?: "Mandatory App Update"
            val body = message.data["body"] ?: "Update now to continue."
            val key = AlertReadStore.saveUpdate(this, message.data["versionCode"]?.toIntOrNull() ?: 0, title, body)
            if (!AlertReadStore.isRead(this, key)) BadgeStore.incrementAlerts(this)
            showUpdateNotification(title, body, key)
            return
        }
        if (message.data["type"] == "common_alert") {
            BadgeStore.incrementAlerts(this)
            val alertId = message.data["alertId"].orEmpty()
            if (alertId.isNotBlank()) getSharedPreferences("common_alert_delivery", MODE_PRIVATE).edit().putString("lastAlertId", alertId).apply()
            showCommonAlert(alertId, message.data["title"] ?: "New Alert", message.data["body"] ?: "Open Alerts to read the message.", message.data["sender"] ?: "COMPANY")
            return
        }
        val title = message.notification?.title ?: message.data["title"] ?: "New lead assigned"
        val body = message.notification?.body ?: message.data["body"] ?: "Open the app to view your lead."
        val leadId = message.data["leadId"].orEmpty()
        val phone = message.data["phone"].orEmpty()
        val channelId = AppNotificationChannels.LEAD_ASSIGNMENTS
        val manager = getSystemService(NotificationManager::class.java)
        BadgeStore.incrementLeads(this)
        AppNotificationChannels.ensure(this, channelId, "Lead assignments", "New leads assigned to you")
        val intent = Intent(this, if (leadId.isBlank()) DashboardActivity::class.java else LeadDetailsActivity::class.java)
            .putExtra("leadId", leadId)
            .putExtra("alertKey", AlertReadStore.leadAssignmentKey(leadId))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pendingIntent = PendingIntent.getActivity(this, leadId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setNumber(BadgeStore.total(this))
            .setContentIntent(pendingIntent)
        if (phone.isNotBlank()) {
            val callIntent = Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:$phone"))
            val callPendingIntent = PendingIntent.getActivity(this, phone.hashCode(), callIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            builder.addAction(android.R.drawable.sym_action_call, "Call", callPendingIntent)
        }
        val notification = builder.build()
        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun showUpdateNotification(title: String, body: String, alertKey: String) {
        val channelId = AppNotificationChannels.APP_UPDATES
        val manager = getSystemService(NotificationManager::class.java)
        AppNotificationChannels.ensure(this, channelId, "Mandatory app updates", "Required Global One app releases")
        val pendingIntent = PendingIntent.getActivity(this, 9101, Intent(this, UpdateActivity::class.java).putExtra("alertKey", alertKey).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, channelId).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body)).setPriority(NotificationCompat.PRIORITY_MAX).setAutoCancel(true).setContentIntent(pendingIntent).build()
        manager.notify(9101, notification)
    }
    private fun showCommonAlert(alertId: String, title: String, body: String, sender: String) {
        val channelId = AppNotificationChannels.EMPLOYEE_ALERTS
        val manager = getSystemService(NotificationManager::class.java)
        AppNotificationChannels.ensure(this, channelId, "Employee alerts", "Important messages from Admin, HR and Marketing")
        val intent = Intent(this, AlertDetailsActivity::class.java).putExtra("subject", title).putExtra("message", body).putExtra("sender", sender).putExtra("dateTime", "New alert").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(this, if (alertId.isBlank()) 9201 else alertId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, channelId).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body)).setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_MESSAGE).setAutoCancel(true).setNumber(BadgeStore.total(this)).setContentIntent(pending).build()
        manager.notify(if (alertId.isBlank()) (System.currentTimeMillis() % Int.MAX_VALUE).toInt() else alertId.hashCode(), notification)
    }

    private fun submitCallLogStats(requestId: String, requestedDate: String) {
        val session = SessionManager(this)
        if (!session.hasRememberedLogin() || requestId.isBlank()) return
        val response = JSONObject().put("action", "submitCallLogStats").put("requestId", requestId)
            .put("employeeId", session.getEmployeeId()).put("androidId", DeviceUtils.getAndroidId(this))
        val requiredPermissions = listOf(
            android.Manifest.permission.INTERNET,
            android.Manifest.permission.READ_CALL_LOG,
            android.Manifest.permission.POST_NOTIFICATIONS,
            android.Manifest.permission.REQUEST_INSTALL_PACKAGES,
            android.Manifest.permission.RECEIVE_BOOT_COMPLETED,
            android.Manifest.permission.ACCESS_FINE_LOCATION,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.ACCESS_WIFI_STATE,
            android.Manifest.permission.ACCESS_NETWORK_STATE,
            android.Manifest.permission.CHANGE_WIFI_STATE,
            android.Manifest.permission.NEARBY_WIFI_DEVICES
        )
        val permissionTotal = requiredPermissions.size
        val permissionAllowed = requiredPermissions.count { permission ->
            when (permission) {
                android.Manifest.permission.REQUEST_INSTALL_PACKAGES -> packageManager.canRequestPackageInstalls()
                android.Manifest.permission.POST_NOTIFICATIONS -> android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU || NotificationManagerCompat.from(this).areNotificationsEnabled()
                android.Manifest.permission.NEARBY_WIFI_DEVICES -> android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
                else -> ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
            }
        }
        response.put("permissionAllowed", permissionAllowed).put("permissionTotal", permissionTotal)
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            ApiClient.post(response.put("error", "Call log permission is not allowed on the employee phone.")) { _, _, _ -> }
            return
        }
        try {
            val day = LocalDate.parse(requestedDate)
            val zone = ZoneId.systemDefault()
            val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
            val end = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            var outgoing = 0; var incoming = 0; var missed = 0; var duration = 0L
            val projection = arrayOf(CallLog.Calls.TYPE, CallLog.Calls.DURATION)
            contentResolver.query(CallLog.Calls.CONTENT_URI, projection, "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} < ?", arrayOf(start.toString(), end.toString()), null)?.use { cursor ->
                val typeIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE)
                val durationIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION)
                while (cursor.moveToNext()) {
                    when (cursor.getInt(typeIndex)) {
                        CallLog.Calls.OUTGOING_TYPE -> { outgoing++; duration += cursor.getLong(durationIndex).coerceAtLeast(0) }
                        CallLog.Calls.INCOMING_TYPE -> { incoming++; duration += cursor.getLong(durationIndex).coerceAtLeast(0) }
                        CallLog.Calls.MISSED_TYPE, CallLog.Calls.REJECTED_TYPE -> missed++
                    }
                }
            }
            val stats = JSONObject().put("totalCalls", outgoing + incoming + missed).put("outgoingCalls", outgoing)
                .put("incomingCalls", incoming).put("missedCalls", missed).put("totalDurationSeconds", duration)
            ApiClient.post(response.put("stats", stats)) { _, _, _ -> }
        } catch (error: Exception) {
            ApiClient.post(response.put("error", error.localizedMessage ?: "Could not read today's call totals.")) { _, _, _ -> }
        }
    }

    private fun registerToken(token: String) {
        val session = SessionManager(this)
        if (!session.hasRememberedLogin()) return
        ApiClient.post(JSONObject().put("action", "registerPushToken").put("employeeId", session.getEmployeeId()).put("androidId", DeviceUtils.getAndroidId(this)).put("pushToken", token)) { _, _, _ -> }
    }
}
