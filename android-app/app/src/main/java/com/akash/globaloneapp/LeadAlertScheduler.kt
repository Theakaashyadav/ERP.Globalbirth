package com.akash.globaloneapp

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.time.LocalDate
import java.util.Calendar

data class LeadAlert(val leadId: String, val title: String, val message: String, val urgent: Boolean)

object LeadAlertFactory {
    fun fromLead(lead: JSONObject): List<LeadAlert> {
        val result = mutableListOf<LeadAlert>()
        val leadId = lead.optString("leadId")
        val name = lead.optString("name").ifBlank { "Lead" }
        val stats = lead.optJSONObject("stats") ?: JSONObject()
        val today = LocalDate.now().toString()
        val calledToday = stats.optString("lastCallAt").startsWith(today)
        if (lead.optString("nextFollowUpDate") == today && !calledToday) {
            result += LeadAlert(leadId, "Follow-up: $name", "Follow-up is scheduled for today.", true)
        }
        if (stats.optString("callMode") == "not_connected_daily") {
            val remaining = stats.optInt("todayRemainingAttempts")
            if (remaining > 0) result += LeadAlert(leadId, "Calls remaining: $name", "$remaining of 3 mandatory call attempts remaining today.", true)
        } else if (stats.optBoolean("followUpCallOverdue")) {
            result += LeadAlert(leadId, "48-hour call due: $name", "The mandatory follow-up call is due now.", true)
        }
        return result
    }
}

object LeadAlertScheduler {
    private val hours = intArrayOf(12, 15, 18)

    fun schedule(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        hours.forEach { hour ->
            val time = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
                if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
            }
            val intent = Intent(context, LeadAlertReceiver::class.java)
            val pending = PendingIntent.getBroadcast(context, 7000 + hour, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time.timeInMillis, pending)
        }
    }
}

class LeadAlertReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        context ?: return
        LeadAlertScheduler.schedule(context)
        val session = SessionManager(context)
        if (!session.hasRememberedLogin() || (!session.hasMobileFeature("leads") && !session.hasMobileFeature("alerts"))) return
        val pendingResult = goAsync()
        ApiClient.post(JSONObject().put("action", "getEmployeeLeads").put("employeeId", session.getEmployeeId())) { ok, _, response ->
            if (ok) {
                val leads = response?.optJSONArray("data")
                if (leads != null) {
                    val alerts = mutableListOf<LeadAlert>()
                    for (index in 0 until leads.length()) {
                        val lead = leads.optJSONObject(index) ?: continue
                        alerts += LeadAlertFactory.fromLead(lead)
                    }
                    BadgeStore.set(context, BadgeStore.pendingFirstCallCount(leads), alerts.size)
                    alerts.forEach { showNotification(context, it) }
                }
            }
            pendingResult.finish()
        }
    }

    private fun showNotification(context: Context, alert: LeadAlert) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Lead alerts", NotificationManager.IMPORTANCE_HIGH))
        val intent = Intent(context, AlertsActivity::class.java).putExtra("leadId", alert.leadId).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, alert.leadId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify((alert.leadId + alert.title).hashCode(), NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(alert.title).setContentText(alert.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(alert.message)).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setNumber(BadgeStore.total(context)).setAutoCancel(true).setContentIntent(pending).build())
    }

    companion object { private const val CHANNEL_ID = "lead_reminder_alerts" }
}

class LeadAlertBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) { context?.let { LeadAlertScheduler.schedule(it); BackgroundSyncService.start(it) } }
}
