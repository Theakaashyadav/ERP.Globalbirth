package com.akash.globaloneapp

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

class AlertsActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout
    private val alerts = mutableListOf<InboxAlert>()
    private var showNew = true

    data class InboxAlert(val id: String, val subject: String, val message: String, val sender: String, val dateTime: String, var isRead: Boolean, val leadId: String = "")

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        root = EmployeeUi.screen(this, "Alerts", "Announcements, updates and reminders", EmployeeUi.NAV_ALERTS, true)
        showLoading()
    }

    override fun onResume() { super.onResume(); loadAlerts() }

    private fun showLoading() {
        root.removeAllViews()
        EmployeeUi.addCard(root, LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(dp(20), dp(34), dp(20), dp(34)); background = rounded("#FFFFFF", 22, "#E2E8F0")
            addView(ProgressBar(this@AlertsActivity), LinearLayout.LayoutParams(dp(42), dp(42)))
            addView(text("Loading alerts...", 14f, "#475569", true).apply { setPadding(0, dp(12), 0, 0) })
        })
    }

    private fun loadAlerts() {
        val session = SessionManager(this); alerts.clear()
        ApiClient.post(JSONObject().put("action", "getEmployeeAlerts").put("employeeId", session.getEmployeeId())) { ok, message, response ->
            if (!ok) { runOnUiThread { showFailure(message) }; return@post }
            response?.optJSONArray("data")?.let { items ->
                for (i in 0 until items.length()) items.optJSONObject(i)?.let { item ->
                    alerts += InboxAlert(item.optString("id"), item.optString("subject"), item.optString("message"), sender(item), formatDate(item.optString("createdAt")), item.optBoolean("isRead"))
                }
            }
            if (session.hasMobileFeature("leads")) loadLeadAlerts(session) else runOnUiThread { render() }
        }
    }

    private fun loadLeadAlerts(session: SessionManager) {
        ApiClient.post(JSONObject().put("action", "getEmployeeLeads").put("employeeId", session.getEmployeeId())) { ok, _, response ->
            val leads = response?.optJSONArray("data")
            if (ok && leads != null) for (i in 0 until leads.length()) {
                val lead = leads.optJSONObject(i) ?: continue
                LeadAlertFactory.fromLead(lead).forEach { alert -> alerts += InboxAlert("lead-${alert.leadId}-${alert.title}", alert.title, alert.message, "LEAD SYSTEM", "Today", false, alert.leadId) }
            }
            BadgeStore.set(this, if (leads == null) 0 else BadgeStore.pendingFirstCallCount(leads), alerts.count { !it.isRead })
            runOnUiThread { EmployeeUi.refreshBadges(this); render() }
        }
    }

    private fun render() {
        root.removeAllViews(); val unread = alerts.count { !it.isRead }
        EmployeeUi.addCard(root, summary(unread, alerts.size))
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(tab("New", unread, showNew) { showNew = true; render() }, LinearLayout.LayoutParams(0, dp(54), 1f).apply { marginEnd = dp(6) })
            addView(tab("Previous", alerts.size - unread, !showNew) { showNew = false; render() }, LinearLayout.LayoutParams(0, dp(54), 1f).apply { marginStart = dp(6) })
        }, LinearLayout.LayoutParams(-1, dp(54)).apply { bottomMargin = dp(16) })
        val visible = alerts.filter { if (showNew) !it.isRead else it.isRead }
        if (visible.isEmpty()) EmployeeUi.addCard(root, EmployeeUi.card(this, if (showNew) "No new alerts" else "No previous alerts", if (showNew) "You are all caught up." else "Alerts you open will appear here.", "#059669"))
        visible.forEach { EmployeeUi.addCard(root, alertCard(it)) }
        LeadAlertScheduler.schedule(this)
    }

    private fun summary(unread: Int, total: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(20), dp(20), dp(20), dp(20)); background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#312E81"), Color.parseColor("#2563EB"))).apply { cornerRadius = dp(24).toFloat() }
        addView(TextView(this@AlertsActivity).apply { text = "🔔"; textSize = 27f; gravity = Gravity.CENTER; background = rounded("#28FFFFFF", 18) }, LinearLayout.LayoutParams(dp(58), dp(58)).apply { marginEnd = dp(15) })
        addView(LinearLayout(this@AlertsActivity).apply {
            orientation = LinearLayout.VERTICAL
            addView(text("$unread new alerts", 21f, "#FFFFFF", true))
            addView(text("$total total messages", 13f, "#DBEAFE").apply { setPadding(0, dp(4), 0, 0) })
        }, LinearLayout.LayoutParams(0, -2, 1f))
    }

    private fun tab(label: String, count: Int, selected: Boolean, click: () -> Unit) = Button(this).apply {
        text = "$label  $count"; isAllCaps = false; typeface = Typeface.DEFAULT_BOLD; textSize = 14f
        setTextColor(Color.parseColor(if (selected) "#FFFFFF" else "#475569")); background = rounded(if (selected) "#2563EB" else "#FFFFFF", 17, if (selected) null else "#CBD5E1")
        setOnClickListener { click() }
    }

    private fun alertCard(alert: InboxAlert) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(15), dp(16), dp(12), dp(16)); background = rounded("#FFFFFF", 20, if (alert.leadId.isNotBlank()) "#F59E0B" else "#D8E2F0"); elevation = dp(2).toFloat()
        addView(TextView(this@AlertsActivity).apply {
            text = if (alert.leadId.isNotBlank()) "☎" else alert.sender.take(1); textSize = 18f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE); background = rounded(if (alert.leadId.isNotBlank()) "#D97706" else "#4F46E5", 16)
        }, LinearLayout.LayoutParams(dp(48), dp(48)).apply { marginEnd = dp(13) })
        addView(LinearLayout(this@AlertsActivity).apply {
            orientation = LinearLayout.VERTICAL
            addView(text(alert.subject, 16f, "#0F172A", true).apply { maxLines = 2 })
            addView(text(alert.sender, 11.5f, "#7C3AED", true).apply { setPadding(0, dp(5), 0, 0) })
            addView(text(alert.message, 12.5f, "#64748B").apply { setPadding(0, dp(5), 0, 0); maxLines = 2 })
            addView(text(alert.dateTime, 11f, "#94A3B8").apply { setPadding(0, dp(7), 0, 0) })
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(TextView(this@AlertsActivity).apply { text = "›"; textSize = 30f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#2563EB")) }, LinearLayout.LayoutParams(dp(30), dp(46)).apply { marginStart = dp(6) })
        setOnClickListener { openAlert(alert) }
    }

    private fun openAlert(alert: InboxAlert) {
        if (alert.leadId.isNotBlank()) { startActivity(Intent(this, LeadDetailsActivity::class.java).putExtra("leadId", alert.leadId)); return }
        if (!alert.isRead) {
            alert.isRead = true; val session = SessionManager(this)
            ApiClient.post(JSONObject().put("action", "markAlertRead").put("employeeId", session.getEmployeeId()).put("alertId", alert.id)) { _, _, _ -> }
        }
        startActivity(Intent(this, AlertDetailsActivity::class.java).putExtra("subject", alert.subject).putExtra("message", alert.message).putExtra("sender", alert.sender).putExtra("dateTime", alert.dateTime))
    }

    private fun sender(item: JSONObject): String {
        val role = item.optString("sentByRole").uppercase(Locale.ENGLISH)
        val name = item.optString("sentByName")
        return if (name.isBlank()) role else "$role • $name"
    }
    private fun formatDate(value: String) = try { OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("dd MMM yyyy • hh:mm a")) } catch (_: Exception) { value }
    private fun showFailure(message: String) { root.removeAllViews(); EmployeeUi.addCard(root, EmployeeUi.card(this, "Unable to load alerts", message, "#DC2626")) }
    private fun text(value: String, size: Float, color: String, bold: Boolean = false) = TextView(this).apply { text = value; textSize = size; setTextColor(Color.parseColor(color)); if (bold) typeface = Typeface.DEFAULT_BOLD }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }
}
