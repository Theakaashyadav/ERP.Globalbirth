package com.akash.globaloneapp

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object AlertReadStore {
    private const val PREFS = "GLOBAL_ONE_ALERT_STATE"
    private const val READ_IDS = "read_ids"
    private const val UPDATE = "latest_update"

    data class UpdateAlert(val key: String, val title: String, val body: String, val versionCode: Int, val receivedAt: Long)

    fun isRead(context: Context, key: String): Boolean = key.isNotBlank() &&
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(READ_IDS, emptySet())?.contains(key) == true

    fun markRead(context: Context, key: String) {
        if (key.isBlank()) return
        val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val values = preferences.getStringSet(READ_IDS, emptySet()).orEmpty().toMutableSet()
        if (values.add(key)) preferences.edit().putStringSet(READ_IDS, values).apply()
    }

    fun saveUpdate(context: Context, versionCode: Int, title: String, body: String): String {
        val key = "app-update-$versionCode"
        val value = JSONObject().put("key", key).put("title", title).put("body", body)
            .put("versionCode", versionCode).put("receivedAt", System.currentTimeMillis()).toString()
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(UPDATE, value).apply()
        return key
    }

    fun latestUpdate(context: Context): UpdateAlert? = try {
        val value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(UPDATE, "").orEmpty()
        if (value.isBlank()) null else JSONObject(value).let {
            UpdateAlert(it.optString("key"), it.optString("title"), it.optString("body"), it.optInt("versionCode"), it.optLong("receivedAt"))
        }
    } catch (_: Exception) { null }

    fun leadAssignmentKey(leadId: String) = "lead-assignment-$leadId"
    fun leadReminderKey(alert: LeadAlert) = "lead-${alert.leadId}-${alert.title}"

    fun unreadLeadCount(context: Context, leads: JSONArray, employeeId: String): Int {
        var count = 0
        for (index in 0 until leads.length()) {
            val lead = leads.optJSONObject(index) ?: continue
            if (lead.optString("assignedEmployeeId") != employeeId) continue
            if (lead.optString("firstCallAt").isBlank() && !isRead(context, leadAssignmentKey(lead.optString("leadId")))) count++
            count += LeadAlertFactory.fromLead(lead).count { !isRead(context, leadReminderKey(it)) }
        }
        return count
    }
}
