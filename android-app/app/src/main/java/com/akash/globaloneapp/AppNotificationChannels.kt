package com.akash.globaloneapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri

object AppNotificationChannels {
    const val LEAD_ASSIGNMENTS = "lead_assignments_custom_v1"
    const val LEAD_REMINDERS = "lead_reminders_custom_v1"
    const val EMPLOYEE_ALERTS = "employee_alerts_custom_v1"
    const val APP_UPDATES = "app_updates_custom_v1"

    fun soundUri(context: Context): Uri = Uri.parse("android.resource://${context.packageName}/${R.raw.push}")

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
