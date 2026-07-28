package com.akash.globaloneapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri

object AppNotificationChannels {
    const val LEAD_ASSIGNMENTS = "lead_assignments_custom_v2"
    const val LEAD_REMINDERS = "lead_reminders_custom_v2"
    const val EMPLOYEE_ALERTS = "employee_alerts_custom_v2"
    const val APP_UPDATES = "app_updates_custom_v2"

    fun soundUri(context: Context): Uri = Uri.parse("android.resource://${context.packageName}/raw/push")

    fun ensureAll(context: Context) {
        ensure(context, LEAD_ASSIGNMENTS, "Lead assignments", "New leads assigned to you")
        ensure(context, LEAD_REMINDERS, "Lead reminders", "Follow-ups and required lead call reminders")
        ensure(context, EMPLOYEE_ALERTS, "Employee alerts", "Important messages from Admin, HR and Marketing")
        ensure(context, APP_UPDATES, "Mandatory app updates", "Required Global One app releases")
    }

    fun ensure(context: Context, id: String, name: String, description: String) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        manager.createNotificationChannel(NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
            this.description = description
            enableVibration(true)
            setSound(soundUri(context), attributes)
        })
    }
}
