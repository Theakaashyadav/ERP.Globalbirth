package com.akash.globaloneapp

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class AlertsActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = EmployeeUi.screen(this, "Lead Alerts", "Follow-ups and mandatory call reminders", EmployeeUi.NAV_ALERTS, true)
        showLoading()
    }

    override fun onResume() { super.onResume(); loadAlerts() }

    private fun showLoading() {
        root.removeAllViews()
        EmployeeUi.addCard(root, LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(20), dp(30), dp(20), dp(30)); background = rounded("#FFFFFF", 22, "#E2E8F0")
            addView(ProgressBar(this@AlertsActivity), LinearLayout.LayoutParams(dp(42), dp(42)))
            addView(label("Checking today’s lead alerts", 15f, "#475569", true).apply { setPadding(0, dp(12), 0, 0) })
        })
    }

    private fun loadAlerts() {
        val session = SessionManager(this)
        ApiClient.post(JSONObject().put("action", "getEmployeeLeads").put("employeeId", session.getEmployeeId())) { ok, message, response -> runOnUiThread {
            root.removeAllViews()
            if (!ok) { EmployeeUi.addCard(root, EmployeeUi.card(this, "Unable to load alerts", message, "#DC2626")); return@runOnUiThread }
            val alerts = mutableListOf<LeadAlert>()
            val leads = response?.optJSONArray("data")
            if (leads != null) for (index in 0 until leads.length()) LeadAlertFactory.fromLead(leads.optJSONObject(index) ?: continue).let(alerts::addAll)
            BadgeStore.set(this, if (leads == null) 0 else BadgeStore.pendingFirstCallCount(leads), alerts.size)
            EmployeeUi.refreshBadges(this)
            root.addView(summaryCard(alerts.size))
            root.addView(EmployeeUi.section(this, "TODAY’S ALERTS"))
            if (alerts.isEmpty()) EmployeeUi.addCard(root, EmployeeUi.card(this, "You’re all caught up", "No follow-ups or mandatory calls are pending right now.", "#059669"))
            alerts.forEach { alert -> EmployeeUi.addCard(root, alertCard(alert)) }
            LeadAlertScheduler.schedule(this)
        }}
    }

    private fun summaryCard(count: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(20), dp(20), dp(20)); background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#7C3AED"), Color.parseColor("#2563EB"))).apply { cornerRadius = dp(24).toFloat() }
        addView(label(count.toString(), 30f, "#FFFFFF", true))
        addView(label(if (count == 1) "alert requires attention" else "alerts require attention", 13f, "#E0E7FF"))
        addView(label("Notifications run daily at 12 PM, 3 PM and 6 PM", 12f, "#DBEAFE").apply { setPadding(0, dp(8), 0, 0) })
    }

    private fun alertCard(alert: LeadAlert) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(16), dp(18), dp(16)); background = rounded("#FFFFFF", 20, if (alert.urgent) "#F59E0B" else "#CBD5E1"); elevation = dp(2).toFloat(); isClickable = true
        addView(label(alert.title, 16f, "#102A43", true))
        addView(label(alert.message, 13f, "#64748B").apply { setPadding(0, dp(6), 0, 0) })
        addView(label("Open lead details  ›", 12.5f, "#2563EB", true).apply { setPadding(0, dp(10), 0, 0) })
        setOnClickListener { startActivity(android.content.Intent(this@AlertsActivity, LeadDetailsActivity::class.java).putExtra("leadId", alert.leadId)) }
    }

    private fun label(value: String, size: Float, color: String, bold: Boolean = false) = TextView(this).apply { text = value; textSize = size; setTextColor(Color.parseColor(color)); if (bold) typeface = Typeface.DEFAULT_BOLD }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }
}
