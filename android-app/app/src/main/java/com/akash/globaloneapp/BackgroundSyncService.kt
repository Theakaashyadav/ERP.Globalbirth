package com.akash.globaloneapp

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

class BackgroundSyncService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var requestInProgress = false
    private val poller = object : Runnable {
        override fun run() {
            if (!SessionManager(this@BackgroundSyncService).hasRememberedLogin()) { stopSelf(); return }
            pollAlerts(); pollCallLogRequests(); handler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate(); createChannels()
        val pending = PendingIntent.getActivity(this, 9400, Intent(this, DashboardActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(9400, NotificationCompat.Builder(this, SYNC_CHANNEL).setSmallIcon(R.mipmap.ic_launcher).setContentTitle("Employee app active").setContentText("Alerts and HR requests are syncing in the background").setPriority(NotificationCompat.PRIORITY_LOW).setOngoing(true).setContentIntent(pending).build())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        handler.removeCallbacks(poller); poller.run(); return START_STICKY
    }
    override fun onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun pollAlerts() {
        val session = SessionManager(this)
        ApiClient.post(JSONObject().put("action", "getEmployeeAlerts").put("employeeId", session.getEmployeeId())) { ok, _, response ->
            if (!ok) return@post
            val items = response?.optJSONArray("data") ?: return@post
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                if (!item.optBoolean("isRead") && notifyAlertIfNew(item)) break
            }
        }
    }

    private fun notifyAlertIfNew(item: JSONObject): Boolean {
        val id = item.optString("id"); if (id.isBlank()) return false
        val preferences = getSharedPreferences("common_alert_delivery", MODE_PRIVATE)
        if (preferences.getString("lastAlertId", "") == id) return false
        preferences.edit().putString("lastAlertId", id).apply(); BadgeStore.incrementAlerts(this)
        val title = item.optString("subject").ifBlank { "New Alert" }; val body = item.optString("message").ifBlank { "Open Alerts to read the message." }
        val pending = PendingIntent.getActivity(this, id.hashCode(), Intent(this, AlertsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        getSystemService(NotificationManager::class.java).notify(id.hashCode(), NotificationCompat.Builder(this, ALERT_CHANNEL).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body)).setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_MESSAGE).setDefaults(NotificationCompat.DEFAULT_ALL).setAutoCancel(true).setNumber(BadgeStore.total(this)).setContentIntent(pending).build())
        return true
    }

    private fun pollCallLogRequests() {
        if (requestInProgress) return
        val session = SessionManager(this); requestInProgress = true
        ApiClient.post(JSONObject().put("action", "getPendingCallLogRequests").put("employeeId", session.getEmployeeId())) { ok, _, response ->
            requestInProgress = false; if (!ok) return@post
            val requests = response?.optJSONArray("data") ?: return@post
            for (index in 0 until requests.length()) requests.optJSONObject(index)?.let { submitCallStats(it.optString("requestId"), it.optString("date")) }
        }
    }

    private fun submitCallStats(requestId: String, requestedDate: String) {
        if (requestId.isBlank()) return
        val session = SessionManager(this)
        val response = JSONObject().put("action", "submitCallLogStats").put("requestId", requestId).put("employeeId", session.getEmployeeId()).put("androidId", DeviceUtils.getAndroidId(this))
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) { ApiClient.post(response.put("error", "Call log permission is not allowed on the employee phone.")) { _, _, _ -> }; return }
        try {
            val day = LocalDate.parse(requestedDate); val zone = ZoneId.systemDefault(); val start = day.atStartOfDay(zone).toInstant().toEpochMilli(); val end = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            var outgoing = 0; var incoming = 0; var missed = 0; var duration = 0L
            contentResolver.query(CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.TYPE, CallLog.Calls.DURATION), "${CallLog.Calls.DATE} >= ? AND ${CallLog.Calls.DATE} < ?", arrayOf(start.toString(), end.toString()), null)?.use { cursor ->
                val type = cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE); val seconds = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION)
                while (cursor.moveToNext()) when (cursor.getInt(type)) {
                    CallLog.Calls.OUTGOING_TYPE -> { outgoing++; duration += cursor.getLong(seconds).coerceAtLeast(0) }
                    CallLog.Calls.INCOMING_TYPE -> { incoming++; duration += cursor.getLong(seconds).coerceAtLeast(0) }
                    CallLog.Calls.MISSED_TYPE, CallLog.Calls.REJECTED_TYPE -> missed++
                }
            }
            ApiClient.post(response.put("stats", JSONObject().put("totalCalls", outgoing + incoming + missed).put("outgoingCalls", outgoing).put("incomingCalls", incoming).put("missedCalls", missed).put("totalDurationSeconds", duration))) { _, _, _ -> }
        } catch (error: Exception) { ApiClient.post(response.put("error", error.localizedMessage ?: "Could not read call logs.")) { _, _, _ -> } }
    }

    private fun createChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(SYNC_CHANNEL, "Background synchronization", NotificationManager.IMPORTANCE_LOW))
        manager.createNotificationChannel(NotificationChannel(ALERT_CHANNEL, "Employee alerts", NotificationManager.IMPORTANCE_HIGH).apply { enableVibration(true); description = "Important employee alerts" })
    }

    companion object {
        private const val SYNC_CHANNEL = "employee_background_sync"
        private const val ALERT_CHANNEL = "company_alerts_v2"
        private const val POLL_INTERVAL_MS = 10_000L
        fun start(context: Context) { if (SessionManager(context).hasRememberedLogin()) try { ContextCompat.startForegroundService(context, Intent(context, BackgroundSyncService::class.java)) } catch (_: Exception) { } }
        fun stop(context: Context) { context.stopService(Intent(context, BackgroundSyncService::class.java)) }
    }
}
