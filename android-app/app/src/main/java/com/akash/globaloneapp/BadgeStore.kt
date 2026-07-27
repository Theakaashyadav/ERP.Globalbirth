package com.akash.globaloneapp

import android.content.Context
import org.json.JSONArray

object BadgeStore {
    private const val PREFS = "GLOBAL_ONE_BADGES"
    private const val LEADS = "assigned_leads"
    private const val ALERTS = "lead_alerts"

    fun leadCount(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(LEADS, 0)
    fun alertCount(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(ALERTS, 0)
    fun total(context: Context) = leadCount(context) + alertCount(context)

    fun set(context: Context, leads: Int, alerts: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putInt(LEADS, leads.coerceAtLeast(0)).putInt(ALERTS, alerts.coerceAtLeast(0)).apply()
    }

    fun incrementLeads(context: Context) = set(context, leadCount(context) + 1, alertCount(context))
    fun incrementAlerts(context: Context) = set(context, leadCount(context), alertCount(context) + 1)

    fun pendingFirstCallCount(leads: JSONArray): Int {
        var count = 0
        for (index in 0 until leads.length()) {
            val lead = leads.optJSONObject(index) ?: continue
            if (lead.optString("assignedEmployeeId").isNotBlank() && lead.optString("firstCallAt").isBlank()) count++
        }
        return count
    }
}
