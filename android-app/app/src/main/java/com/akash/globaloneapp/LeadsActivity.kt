package com.akash.globaloneapp

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ArrayAdapter
import android.widget.AdapterView
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Spinner
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

class LeadsActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout
    private lateinit var listContainer: LinearLayout
    private var leads = JSONArray()
    private var executives = JSONArray()
    private var query = ""
    private var selectedTab = "new"
    private var selectedExecutiveId = ""
    private val refreshHandler = Handler(Looper.getMainLooper())
    private val refreshTask = object : Runnable {
        override fun run() {
            load()
            refreshHandler.postDelayed(this, 30_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = EmployeeUi.screen(this, "Assigned Leads", "Call, follow up and close opportunities", EmployeeUi.NAV_LEADS, true)
        showLoading()
    }

    override fun onResume() { super.onResume(); load() }

    override fun onStart() {
        super.onStart()
        refreshHandler.removeCallbacks(refreshTask)
        refreshHandler.postDelayed(refreshTask, 30_000L)
    }

    override fun onStop() {
        refreshHandler.removeCallbacks(refreshTask)
        super.onStop()
    }

    private fun load() {
        val session = SessionManager(this)
        val employeeId = session.getEmployeeId()
        val request = if (session.isTeamLead()) JSONObject().put("action", "getTeamLeadWorkspaceLeads").put("teamLeadId", employeeId)
            else JSONObject().put("action", "getEmployeeLeads").put("employeeId", employeeId)
        ApiClient.post(request) { ok, message, response ->
            runOnUiThread {
                if (!ok) showError(message) else {
                    if (session.isTeamLead()) {
                        val data = response?.optJSONObject("data")
                        leads = data?.optJSONArray("leads") ?: JSONArray()
                        executives = data?.optJSONArray("executives") ?: JSONArray()
                    } else {
                        leads = response?.optJSONArray("data") ?: JSONArray()
                        executives = JSONArray()
                    }
                    var alertCount = 0
                    val ownLeads = JSONArray()
                    for (index in 0 until leads.length()) {
                        val lead = leads.optJSONObject(index) ?: continue
                        if (lead.optString("assignedEmployeeId") == employeeId) { ownLeads.put(lead); alertCount += LeadAlertFactory.fromLead(lead).size }
                    }
                    BadgeStore.set(this, BadgeStore.pendingFirstCallCount(ownLeads), alertCount)
                    EmployeeUi.refreshBadges(this)
                    buildPage()
                }
            }
        }
    }

    private fun showLoading() {
        root.removeAllViews()
        EmployeeUi.addCard(root, LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(34), dp(24), dp(34)); background = rounded("#FFFFFF", 22, "#E2E8F0")
            addView(ProgressBar(this@LeadsActivity).apply { isIndeterminate = true }, LinearLayout.LayoutParams(dp(42), dp(42)))
            addView(text("Loading assigned leads", 15f, "#334155", true).apply { setPadding(0, dp(14), 0, 0) })
        })
    }

    private fun showError(message: String) {
        AppToast.error(this, message.ifBlank { "Please check the server connection." })
        root.removeAllViews()
        EmployeeUi.addCard(root, EmployeeUi.card(this, "Unable to load leads", message.ifBlank { "Please check the server connection." }, "#DC2626"))
        root.addView(EmployeeUi.button(this, "Try Again") { showLoading(); load() })
    }

    private fun buildPage() {
        root.removeAllViews()
        val stats = aggregateStats()
        EmployeeUi.addCard(root, summaryCard(stats.first, stats.second, stats.third))
        if (SessionManager(this).isTeamLead()) addTeamLeadTabs()
        root.addView(EmployeeUi.section(this, "FIND A LEAD"))
        val search = EditText(this).apply {
            hint = "Search by name or phone number"; setText(query); setSelection(text.length); textSize = 15f; isSingleLine = true
            setTextColor(Color.parseColor("#102A43")); setHintTextColor(Color.parseColor("#94A3B8")); setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.ic_search_leads, 0, 0, 0); compoundDrawablePadding = dp(11)
            setPadding(dp(16), dp(13), dp(16), dp(13)); background = rounded("#FFFFFF", 18, "#CBD5E1")
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { query = s?.toString().orEmpty(); renderList() }
                override fun afterTextChanged(s: Editable?) = Unit
            })
        }
        root.addView(search, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply { bottomMargin = dp(12) })
        listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(listContainer)
        renderList()
    }

    private fun addTeamLeadTabs() {
        val employeeId = SessionManager(this).getEmployeeId()
        fun count(tab: String): Int { var total = 0; for (index in 0 until leads.length()) if (matchesTab(leads.optJSONObject(index) ?: continue, tab, employeeId)) total++; return total }
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setPadding(dp(5), dp(5), dp(5), dp(5)); background = rounded("#E2E8F0", 18)
            listOf(Triple("new", "New Leads", count("new")), Triple("mine", "My Leads", count("mine")), Triple("team", "Team Leads", count("team"))).forEach { item ->
                addView(TextView(this@LeadsActivity).apply {
                    text = "${item.second}\n${item.third}"; textSize = 11.5f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.parseColor(if (selectedTab == item.first) "#FFFFFF" else "#475569")); background = rounded(if (selectedTab == item.first) "#7C3AED" else "#00000000", 14); setPadding(dp(5), dp(9), dp(5), dp(9))
                    setOnClickListener { selectedTab = item.first; buildPage() }
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(2); marginEnd = dp(2) })
            }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) })
        if (selectedTab == "team") {
            root.addView(EmployeeUi.section(this, "SELECT EXECUTIVE"))
            val labels = mutableListOf("All Executives")
            for (index in 0 until executives.length()) { val item = executives.optJSONObject(index); labels += "${item.optString("fullName")} (${item.optString("employeeId")})" }
            root.addView(Spinner(this).apply {
                adapter = ArrayAdapter(this@LeadsActivity, android.R.layout.simple_spinner_dropdown_item, labels)
                val selectedIndex = (0 until executives.length()).firstOrNull { executives.optJSONObject(it).optString("employeeId") == selectedExecutiveId }?.plus(1) ?: 0
                setSelection(selectedIndex); background = rounded("#FFFFFF", 16, "#CBD5E1"); setPadding(dp(13), 0, dp(13), 0)
                onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                    override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { selectedExecutiveId = if (position == 0) "" else executives.optJSONObject(position - 1).optString("employeeId"); renderList() }
                    override fun onNothingSelected(parent: AdapterView<*>?) = Unit
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)).apply { bottomMargin = dp(12) })
        }
    }

    private fun matchesTab(lead: JSONObject, tab: String = selectedTab, employeeId: String = SessionManager(this).getEmployeeId()): Boolean = when (tab) {
        "new" -> lead.optString("assignedEmployeeId") == employeeId && lead.optString("assignmentStage").equals("TL", true) && lead.optString("firstCallAt").isBlank()
        "mine" -> lead.optString("assignedEmployeeId") == employeeId && lead.optString("assignmentStage").equals("TL", true) && lead.optString("firstCallAt").isNotBlank()
        "team" -> lead.optString("assignmentStage").equals("Executive", true) && (selectedExecutiveId.isBlank() || lead.optString("assignedEmployeeId") == selectedExecutiveId)
        else -> true
    }

    private fun aggregateStats(): Triple<Int, Int, Int> {
        var attemptedToday = 0; var completed = 0
        for (index in 0 until leads.length()) {
            val stats = leads.optJSONObject(index)?.optJSONObject("stats") ?: continue
            if (stats.optInt("todayAttempts") > 0) attemptedToday++
            if (stats.optBoolean("archiveEligible")) completed++
        }
        return Triple(leads.length(), attemptedToday, completed)
    }

    private fun summaryCard(total: Int, activeToday: Int, completed: Int): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(20), dp(20), dp(18)); elevation = dp(7).toFloat()
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#312E81"), Color.parseColor("#7C3AED"), Color.parseColor("#2563EB"))).apply { cornerRadius = dp(24).toFloat() }
        addView(LinearLayout(this@LeadsActivity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            addView(FrameLayout(this@LeadsActivity).apply { background = rounded("#2FFFFFFF", 16); addView(ImageView(this@LeadsActivity).apply { setImageResource(R.drawable.ic_dashboard_leads); setPadding(dp(11), dp(11), dp(11), dp(11)) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }, LinearLayout.LayoutParams(dp(50), dp(50)).apply { marginEnd = dp(13) })
            addView(LinearLayout(this@LeadsActivity).apply { orientation = LinearLayout.VERTICAL; addView(text("Sales Pipeline", 20f, "#FFFFFF", true)); addView(text(if (SessionManager(this@LeadsActivity).isTeamLead()) "Team Leader workspace" else "Executive workspace", 12.5f, "#DDD6FE")) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        })
        addView(LinearLayout(this@LeadsActivity).apply {
            orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(18), 0, 0)
            addView(metric(total.toString(), "Assigned"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(5) })
            addView(metric(activeToday.toString(), "Called today"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(5); marginEnd = dp(5) })
            addView(metric(completed.toString(), "Complete"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(5) })
        })
    }

    private fun metric(value: String, label: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(5), dp(11), dp(5), dp(10)); background = rounded("#25FFFFFF", 14)
        addView(text(value, 20f, "#FFFFFF", true).apply { gravity = Gravity.CENTER; textAlignment = View.TEXT_ALIGNMENT_CENTER }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        addView(text(label, 10.5f, "#E0E7FF").apply { gravity = Gravity.CENTER; textAlignment = View.TEXT_ALIGNMENT_CENTER; maxLines = 2 }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    private fun renderList() {
        if (!::listContainer.isInitialized) return
        listContainer.removeAllViews()
        val needle = query.trim().lowercase()
        var shown = 0
        for (index in 0 until leads.length()) {
            val lead = leads.optJSONObject(index) ?: continue
            if (SessionManager(this).isTeamLead() && !matchesTab(lead)) continue
            val name = lead.optString("name")
            val phone = lead.optString("phone")
            if (needle.isNotEmpty() && !name.lowercase().contains(needle) && !phone.contains(needle)) continue
            listContainer.addView(leadCard(lead), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(13) })
            shown++
        }
        if (shown == 0) listContainer.addView(emptyCard(if (query.isBlank()) "No leads assigned yet" else "No matching leads", if (query.isBlank()) "New assignments will appear here automatically." else "Try a different name or phone number."))
    }

    private fun leadCard(lead: JSONObject): View {
        val stats = lead.optJSONObject("stats") ?: JSONObject()
        val status = lead.optString("status").ifBlank { "New" }
        val accent = statusColor(status, stats.optBoolean("archiveEligible"))
        val today = stats.optInt("todayAttempts")
        val days = stats.optInt("completedDays")
        val connectedMode = stats.optString("callMode") == "connected_48h"
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(17), dp(17), dp(15), dp(15)); background = rounded("#FFFFFF", 21, "#E2E8F0"); elevation = dp(3).toFloat(); isClickable = true; isFocusable = true
            setOnClickListener { startActivity(Intent(this@LeadsActivity, LeadDetailsActivity::class.java).putExtra("leadId", lead.optString("leadId"))) }
            addView(LinearLayout(this@LeadsActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                addView(TextView(this@LeadsActivity).apply { text = lead.optString("name").take(1).uppercase().ifBlank { "L" }; textSize = 20f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)); background = rounded(softColor(accent), 16) }, LinearLayout.LayoutParams(dp(50), dp(50)).apply { marginEnd = dp(13) })
                addView(LinearLayout(this@LeadsActivity).apply { orientation = LinearLayout.VERTICAL; addView(text(lead.optString("name").ifBlank { "Unnamed Lead" }, 17f, "#102A43", true)); addView(text(lead.optString("phone"), 13f, "#64748B").apply { setPadding(0, dp(3), 0, 0) }); if (selectedTab == "team") addView(text("Assigned to ${lead.optString("assignedEmployeeName").ifBlank { lead.optString("assignedEmployeeId") }}", 11.5f, "#7C3AED", true).apply { setPadding(0, dp(4), 0, 0) }) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                addView(TextView(this@LeadsActivity).apply { text = status; textSize = 10.5f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)); background = rounded(softColor(accent), 20); setPadding(dp(9), dp(6), dp(9), dp(6)); maxLines = 1 })
            })
            addView(View(this@LeadsActivity).apply { setBackgroundColor(Color.parseColor("#E2E8F0")) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)).apply { topMargin = dp(14); bottomMargin = dp(13) })
            addView(LinearLayout(this@LeadsActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(progressChip(if (connectedMode) "1 / 48h" else "$today/3", if (connectedMode) "Call frequency" else "Calls today", "#2563EB", "#EFF6FF"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(6) })
                addView(progressChip(if (connectedMode) "${stats.optInt("hoursUntilNextRequiredCall")}h" else "$days/4", if (connectedMode) "Time remaining" else "Calling days", "#7C3AED", "#F5F3FF"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(6) })
            })
            val hint = when {
                SessionManager(this@LeadsActivity).isTeamLead() && lead.optString("assignmentStage").equals("TL", ignoreCase = true) -> "Handle this lead or optionally assign it to an Executive"
                lead.optInt("deadlineRemainingSeconds") > 0 -> "First call due in ${lead.optInt("deadlineRemainingSeconds") / 60} minutes"
                stats.optString("requirementSummary").isNotBlank() -> stats.optString("requirementSummary")
                lead.optString("lastRemark").isNotBlank() -> lead.optString("lastRemark")
                else -> "Tap to view call history and update follow-up"
            }
            addView(LinearLayout(this@LeadsActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(13), 0, 0)
                addView(text(hint, 12f, "#64748B").apply { maxLines = 2 }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                addView(ImageView(this@LeadsActivity).apply { setImageResource(R.drawable.ic_chevron_right); setColorFilter(Color.parseColor("#2563EB")); setPadding(dp(5), dp(5), dp(5), dp(5)) }, LinearLayout.LayoutParams(dp(30), dp(30)).apply { marginStart = dp(8) })
            })
        }
    }

    private fun progressChip(value: String, label: String, accent: String, soft: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(10), dp(12), dp(10)); background = rounded(soft, 14)
        addView(text(value, 16f, accent, true)); addView(text(label, 10.5f, "#64748B"))
    }

    private fun emptyCard(title: String, subtitle: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(22), dp(30), dp(22), dp(30)); background = rounded("#FFFFFF", 22, "#E2E8F0")
        addView(text(title, 17f, "#334155", true)); addView(text(subtitle, 13f, "#64748B").apply { gravity = Gravity.CENTER; setPadding(0, dp(7), 0, 0) })
    }

    private fun statusColor(status: String, complete: Boolean): String = when { complete -> "#059669"; status.contains("Hot", true) -> "#DC2626"; status.contains("Interested", true) -> "#059669"; status.contains("No Response", true) -> "#D97706"; else -> "#7C3AED" }
    private fun softColor(accent: String) = when(accent) { "#059669" -> "#ECFDF5"; "#DC2626" -> "#FEF2F2"; "#D97706" -> "#FFFBEB"; "#2563EB" -> "#EFF6FF"; else -> "#F5F3FF" }
    private fun text(value: String, size: Float, color: String, bold: Boolean = false) = TextView(this).apply { text = value; textSize = size; setTextColor(Color.parseColor(color)); if (bold) typeface = Typeface.DEFAULT_BOLD }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }
}
