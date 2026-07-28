package com.akash.globaloneapp

import android.Manifest
import android.app.DatePickerDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.view.View
import android.view.ViewGroup
import android.view.Gravity
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.time.Instant
import java.util.Calendar
import java.util.Date
import java.util.Locale

class LeadDetailsActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout
    private lateinit var remark: EditText
    private lateinit var status: Spinner
    private lateinit var nextFollowUpDate: EditText
    private lateinit var meetingDate: EditText
    private var currentLead: JSONObject? = null
    private var syncCompletedForView = false
    private var dialerOpened = false
    private val expiryHandler = Handler(Looper.getMainLooper())
    private val employeeId by lazy { SessionManager(this).getEmployeeId() }
    private val leadId by lazy { intent.getStringExtra("leadId").orEmpty() }

    companion object { private const val CALL_LOG_PERMISSION = 403 }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        intent.getStringExtra("alertKey")?.takeIf { it.isNotBlank() }?.let {
            if (!AlertReadStore.isRead(this, it)) {
                AlertReadStore.markRead(this, it)
                BadgeStore.set(this, BadgeStore.leadCount(this), (BadgeStore.alertCount(this) - 1).coerceAtLeast(0))
            }
        }
        load()
    }

    override fun onResume() {
        super.onResume()
        if (dialerOpened) {
            dialerOpened = false
            syncCompletedForView = false
            load()
        }
    }

    override fun onStop() {
        expiryHandler.removeCallbacksAndMessages(null)
        super.onStop()
    }

    private fun load() {
        ApiClient.post(JSONObject().put("action", "getLeadDetails").put("leadId", leadId).put("employeeId", employeeId)) { ok, message, response ->
            runOnUiThread {
                val lead = response?.optJSONObject("data")
                if (!ok || lead == null) { EmployeeUi.toast(this, message.ifBlank { "Lead not found." }); finish(); return@runOnUiThread }
                currentLead = lead
                build(lead)
                refreshBadgeCounts()
                scheduleExpiryRefresh(lead)
                if (!syncCompletedForView && lead.optString("assignedEmployeeId") == employeeId) ensureCallLogSync(lead)
            }
        }
    }

    private fun refreshBadgeCounts() {
        ApiClient.post(JSONObject().put("action", "getEmployeeLeads").put("employeeId", employeeId)) { ok, _, response ->
            if (!ok) return@post
            val leads = response?.optJSONArray("data") ?: return@post
            val alertCount = AlertReadStore.unreadLeadCount(this, leads, employeeId)
            BadgeStore.set(this, BadgeStore.pendingFirstCallCount(leads), alertCount)
            runOnUiThread { EmployeeUi.refreshBadges(this) }
        }
    }

    private fun scheduleExpiryRefresh(lead: JSONObject) {
        expiryHandler.removeCallbacksAndMessages(null)
        val deadline = try { Instant.parse(lead.optString("firstCallDeadline")).toEpochMilli() } catch (_: Exception) { 0L }
        if (deadline <= 0L || lead.optString("firstCallAt").isNotBlank()) return
        expiryHandler.postDelayed({ load() }, (deadline - System.currentTimeMillis()).coerceAtLeast(0L) + 1_500L)
    }

    private fun build(lead: JSONObject) {
        root = EmployeeUi.screen(this, "Lead Details", "Contact, delegate and manage follow-up", EmployeeUi.NAV_LEADS, true)
        if (lead.optString("assignedEmployeeId") != employeeId) EmployeeUi.addCard(root, noticeCard("Team lead view", "This lead is assigned to ${lead.optString("assignedEmployeeName").ifBlank { "your Executive" }}. You can review its status, remarks and call history here.", "#7C3AED", "#F5F3FF"))
        EmployeeUi.addCard(root, contactCard(lead))
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        actions.addView(actionButton(R.drawable.ic_dashboard_leads, "Call Lead", "#059669") {
            dialerOpened = true; startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${lead.optString("phone")}")))
        }, LinearLayout.LayoutParams(0, dp(56), 1f).apply { marginEnd = dp(7) })
        actions.addView(actionButton(R.drawable.ic_whatsapp, "WhatsApp", "#16A34A") { openWhatsApp(lead.optString("phone")) }, LinearLayout.LayoutParams(0, dp(56), 1f).apply { marginStart = dp(7) })
        root.addView(actions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(16) })

        val stats = lead.optJSONObject("stats") ?: JSONObject()
        val connectedMode = stats.optString("callMode") == "connected_48h"
        root.addView(sectionHeading("CALL PERFORMANCE", "Automatically matched from this phone"))
        EmployeeUi.addCard(root, LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setPadding(dp(8), dp(8), dp(8), dp(8)); background = rounded("#FFFFFF", 21, "#E2E8F0")
            addView(metric(stats.optInt("totalAttempts").toString(), "All calls", "#7C3AED", "#F5F3FF"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(metric(stats.optInt("connectedAttempts").toString(), "Connected", "#059669", "#ECFDF5"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(metric(if (connectedMode) "1/48h" else "${stats.optInt("todayAttempts")}/3", if (connectedMode) "Follow-up" else "Today", "#2563EB", "#EFF6FF"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(metric(if (connectedMode) "${stats.optInt("hoursUntilNextRequiredCall")}h" else "${stats.optInt("completedDays")}/4", if (connectedMode) "Time left" else "Days", "#D97706", "#FFFBEB"), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        })
        EmployeeUi.addCard(root, noticeCard(if (connectedMode) "48-hour follow-up rule" else "Daily call rule", stats.optString("requirementSummary"), if (stats.optBoolean("followUpCallOverdue")) "#DC2626" else "#2563EB", if (stats.optBoolean("followUpCallOverdue")) "#FEF2F2" else "#EFF6FF"))
        if (lead.optInt("deadlineRemainingSeconds") > 0) {
            EmployeeUi.addCard(root, noticeCard("First-call deadline", "${lead.optInt("deadlineRemainingSeconds") / 60} minutes remaining to call or delegate this lead.", "#DC2626", "#FEF2F2"))
        }
        if (SessionManager(this).isTeamLead() && lead.optString("assignmentStage").equals("TL", ignoreCase = true)) {
            root.addView(sectionHeading("ASSIGN TO EXECUTIVE", "Optional — you may handle this lead yourself or delegate it"))
            val delegationPanel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(18), dp(18), dp(18)); background = rounded("#FFFFFF", 21, "#E2E8F0"); elevation = dp(3).toFloat() }
            EmployeeUi.addCard(root, delegationPanel)
            addExecutiveAssignment(delegationPanel)
        }

        root.addView(sectionHeading("FOLLOW-UP UPDATE", "Select an outcome and record the next action"))
        val statuses = listOf("Interested", "Not Interested", "No Response", "Cold", "Hot", "Wrong No.", "Meeting Fix")
        status = Spinner(this).apply {
            adapter = ArrayAdapter(this@LeadDetailsActivity, android.R.layout.simple_spinner_dropdown_item, statuses)
            val position = statuses.indexOf(lead.optString("status")); if (position >= 0) setSelection(position)
            background = rounded("#F8FAFC", 15, "#CBD5E1"); setPadding(dp(13), 0, dp(13), 0)
        }
        nextFollowUpDate = dateInput("Next follow-up date").apply { setText(lead.optString("nextFollowUpDate")) }
        meetingDate = dateInput("Meeting date").apply { setText(lead.optString("meetingDate")) }
        remark = EmployeeUi.input(this, "Mandatory remark: response, objection, or next action", 3).apply { setText(lead.optString("lastRemark")) }
        val followUpCard = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(10), dp(18), dp(18)); background = rounded("#FFFFFF", 21, "#E2E8F0"); elevation = dp(3).toFloat() }
        followUpCard.addView(fieldLabel("FOLLOW-UP STATUS")); followUpCard.addView(status, fieldParams())
        followUpCard.addView(nextFollowUpDate, fieldParams())
        followUpCard.addView(meetingDate, fieldParams())
        followUpCard.addView(fieldLabel("REMARK")); followUpCard.addView(remark, fieldParams())
        status.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) = updateConditionalDates()
            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }
        updateConditionalDates()
        followUpCard.addView(EmployeeUi.button(this, "Save Follow-up") { saveFollowUp() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)).apply { topMargin = dp(4) })
        EmployeeUi.addCard(root, followUpCard)

        root.addView(sectionHeading("CONVERSATION HISTORY", "Every follow-up remark is retained in chronological order"))
        val followUpHistory = lead.optJSONArray("followUpHistory")
        if (followUpHistory == null || followUpHistory.length() == 0) {
            EmployeeUi.addCard(root, noticeCard("No follow-up history", "The first saved follow-up will appear here and will never overwrite later conversations.", "#64748B", "#F8FAFC"))
        } else {
            for (index in followUpHistory.length() - 1 downTo 0) {
                EmployeeUi.addCard(root, followUpHistoryCard(followUpHistory.optJSONObject(index)))
            }
        }

        root.addView(sectionHeading("MATCHED PHONE CALLS", "Latest call attempts appear first"))
        val attempts = lead.optJSONArray("attempts")
        if (attempts == null || attempts.length() == 0) {
            EmployeeUi.addCard(root, noticeCard("No matching calls yet", "Use Call Lead above. The app will match and sync the outgoing phone call automatically.", "#64748B", "#F8FAFC"))
        } else {
            for (i in attempts.length() - 1 downTo 0) {
                val attempt = attempts.optJSONObject(i)
                val connected = attempt.optBoolean("connected")
                val duration = attempt.optInt("durationSeconds")
                EmployeeUi.addCard(root, callAttemptCard(if (connected) "Connected" else "Not Connected", attempt.optString("calledAt"), formatDuration(duration), connected))
            }
        }

        root.addView(EmployeeUi.button(this, "Remove Lead", "#DC2626") {
            if (!stats.optBoolean("archiveEligible")) EmployeeUi.toast(this, if (connectedMode) "Connected leads require one follow-up call every 48 hours." else "Complete 3 calls per day for 4 days before removing this lead.")
            else AlertDialog.Builder(this).setMessage("Remove this lead from your active list?").setPositiveButton("Remove") { _, _ -> archiveLead() }.setNegativeButton("Cancel", null).show()
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)).apply { topMargin = dp(4); bottomMargin = dp(18) })
    }

    private fun addExecutiveAssignment(container: LinearLayout) {
        ApiClient.post(JSONObject().put("action", "getTeamExecutives").put("teamLeadId", employeeId)) { ok, message, response -> runOnUiThread {
            if (!ok) { EmployeeUi.toast(this, message); return@runOnUiThread }
            val executives = response?.optJSONArray("data") ?: return@runOnUiThread
            container.removeAllViews()
            if (executives.length() == 0) { EmployeeUi.addCard(container, EmployeeUi.card(this, "No Executive available", "Ask HR to set a Sales employee's designation to Executive and select you as their TL.")); return@runOnUiThread }
            val names = (0 until executives.length()).map { executives.optJSONObject(it).optString("fullName") + " (" + executives.optJSONObject(it).optString("employeeId") + ")" }
            container.addView(fieldLabel("SELECT EXECUTIVE"))
            val picker = Spinner(this).apply { adapter = ArrayAdapter(this@LeadDetailsActivity, android.R.layout.simple_spinner_dropdown_item, names); background = rounded("#F8FAFC", 15, "#CBD5E1"); setPadding(dp(13),0,dp(13),0) }
            container.addView(picker, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)).apply { bottomMargin = dp(12) })
            container.addView(EmployeeUi.button(this, "Assign Lead to Executive", "#7C3AED") {
                val executiveId = executives.optJSONObject(picker.selectedItemPosition).optString("employeeId")
                ApiClient.post(JSONObject().put("action", "assignLeadToExecutive").put("leadId", leadId).put("teamLeadId", employeeId).put("executiveId", executiveId)) { assigned, resultMessage, _ -> runOnUiThread { EmployeeUi.toast(this, resultMessage); if (assigned) { syncCompletedForView = false; load() } } }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)))
        }}
    }

    private fun contactCard(lead: JSONObject): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(21), dp(20), dp(19)); elevation = dp(7).toFloat()
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#172554"), Color.parseColor("#2563EB"), Color.parseColor("#0891B2"))).apply { cornerRadius = dp(24).toFloat() }
        addView(LinearLayout(this@LeadDetailsActivity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            addView(TextView(this@LeadDetailsActivity).apply { text = lead.optString("name").take(1).uppercase().ifBlank { "L" }; textSize = 25f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE); background = rounded("#30FFFFFF", 50) }, LinearLayout.LayoutParams(dp(66), dp(66)).apply { marginEnd = dp(15) })
            addView(LinearLayout(this@LeadDetailsActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@LeadDetailsActivity).apply { text = lead.optString("name").ifBlank { "Unnamed Lead" }; textSize = 22f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE) })
                addView(TextView(this@LeadDetailsActivity).apply { text = lead.optString("phone"); textSize = 15f; setTextColor(Color.parseColor("#DBEAFE")); setPadding(0, dp(3), 0, 0) })
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(this@LeadDetailsActivity).apply { text = lead.optString("status").ifBlank { "New" }; textSize = 10.5f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE); background = rounded("#30FFFFFF", 20); setPadding(dp(9), dp(6), dp(9), dp(6)); maxLines = 1 })
        })
        addView(TextView(this@LeadDetailsActivity).apply { text = "${lead.optString("city").ifBlank { "City not provided" }}  •  ${lead.optString("assignmentStage").ifBlank { "Assigned" }}"; textSize = 12.5f; setTextColor(Color.parseColor("#E0F2FE")); setPadding(0, dp(15), 0, 0) })
    }

    private fun actionButton(icon: Int, label: String, color: String, click: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; background = rounded(color, 17); elevation = dp(4).toFloat(); isClickable = true; isFocusable = true; setOnClickListener { click() }
        addView(ImageView(this@LeadDetailsActivity).apply { setImageResource(icon); setColorFilter(Color.WHITE); setPadding(dp(4), dp(4), dp(4), dp(4)) }, LinearLayout.LayoutParams(dp(28), dp(28)).apply { marginEnd = dp(7) })
        addView(TextView(this@LeadDetailsActivity).apply { text = label; textSize = 14.5f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE) })
    }

    private fun openWhatsApp(phone: String) {
        val number = normalizePhone(phone)
        if (number.length != 10) { EmployeeUi.toast(this, "A valid 10-digit lead phone number is required."); return }
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/91$number"))) }
        catch (_: Exception) { EmployeeUi.toast(this, "WhatsApp could not be opened on this device.") }
    }

    private fun sectionHeading(title: String, subtitle: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(4), dp(11), dp(4), dp(10))
        addView(TextView(this@LeadDetailsActivity).apply { text = title; textSize = 13f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#334155")); letterSpacing = .08f })
        addView(TextView(this@LeadDetailsActivity).apply { text = subtitle; textSize = 11.5f; setTextColor(Color.parseColor("#94A3B8")); setPadding(0, dp(3), 0, 0) })
    }

    private fun metric(value: String, label: String, accent: String, soft: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(3), dp(11), dp(3), dp(10)); background = rounded(soft, 14)
        addView(TextView(this@LeadDetailsActivity).apply { text = value; textSize = 18f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)) })
        addView(TextView(this@LeadDetailsActivity).apply { text = label; textSize = 9.5f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#64748B")); maxLines = 1 })
    }

    private fun noticeCard(title: String, body: String, accent: String, soft: String): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(17), dp(15), dp(17), dp(15)); background = rounded(soft, 18, accent)
        addView(TextView(this@LeadDetailsActivity).apply { text = title; textSize = 15f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)) })
        addView(TextView(this@LeadDetailsActivity).apply { text = body; textSize = 12.5f; setTextColor(Color.parseColor("#475569")); setPadding(0, dp(5), 0, 0) })
    }

    private fun callAttemptCard(title: String, calledAt: String, duration: String, connected: Boolean): View {
        val accent = if (connected) "#059669" else "#DC2626"; val soft = if (connected) "#ECFDF5" else "#FEF2F2"
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(16), dp(14), dp(16), dp(14)); background = rounded("#FFFFFF", 18, "#E2E8F0")
            addView(TextView(this@LeadDetailsActivity).apply { text = if (connected) "✓" else "×"; textSize = 21f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)); background = rounded(soft, 50) }, LinearLayout.LayoutParams(dp(44), dp(44)).apply { marginEnd = dp(13) })
            addView(LinearLayout(this@LeadDetailsActivity).apply { orientation = LinearLayout.VERTICAL; addView(TextView(this@LeadDetailsActivity).apply { text = title; textSize = 15f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)) }); addView(TextView(this@LeadDetailsActivity).apply { text = calledAt; textSize = 11.5f; setTextColor(Color.parseColor("#64748B")); setPadding(0, dp(3), 0, 0) }) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(TextView(this@LeadDetailsActivity).apply { text = duration; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#334155")); background = rounded("#F1F5F9", 20); setPadding(dp(9), dp(6), dp(9), dp(6)) })
        }
    }

    private fun followUpHistoryCard(item: JSONObject): View = LinearLayout(this).apply {
        val itemStatus = item.optString("status").ifBlank { "Follow Up" }
        val authorId = item.optString("employeeId")
        orientation = LinearLayout.VERTICAL; setPadding(dp(17), dp(15), dp(17), dp(15)); background = rounded("#FFFFFF", 18, "#DDD6FE")
        addView(LinearLayout(this@LeadDetailsActivity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            addView(TextView(this@LeadDetailsActivity).apply { text = itemStatus; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#6D28D9")); background = rounded("#F5F3FF", 20); setPadding(dp(9), dp(5), dp(9), dp(5)) })
            addView(TextView(this@LeadDetailsActivity).apply { text = item.optString("createdAt").replace("T", " ").take(16); textSize = 11.5f; gravity = Gravity.END; setTextColor(Color.parseColor("#64748B")) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        })
        addView(TextView(this@LeadDetailsActivity).apply { text = item.optString("remark"); textSize = 14.5f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#1E293B")); setPadding(0, dp(11), 0, dp(9)); setLineSpacing(dp(2).toFloat(), 1f) })
        val nextAction = when { item.optString("meetingDate").isNotBlank() -> "Meeting: ${item.optString("meetingDate")}"; item.optString("nextFollowUpDate").isNotBlank() -> "Next follow-up: ${item.optString("nextFollowUpDate")}"; else -> "No next date recorded" }
        addView(TextView(this@LeadDetailsActivity).apply { text = "${if (authorId == employeeId) "You" else authorId.ifBlank { "Employee" }}  •  $nextAction"; textSize = 11.5f; setTextColor(Color.parseColor("#64748B")) })
    }

    private fun fieldLabel(value: String): View = TextView(this).apply { text = value; textSize = 11.5f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#64748B")); letterSpacing = .07f; setPadding(dp(2), dp(10), 0, dp(7)) }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }

    private fun fieldParams() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = EmployeeUi.dp(root, 12) }

    private fun dateInput(hint: String) = EmployeeUi.input(this, hint).apply {
        isFocusable = false
        setOnClickListener {
            val calendar = Calendar.getInstance()
            DatePickerDialog(this@LeadDetailsActivity, { _, year, month, day -> setText(String.format(Locale.ENGLISH, "%04d-%02d-%02d", year, month + 1, day)) }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
        }
    }

    private fun updateConditionalDates() {
        val selected = status.selectedItem?.toString().orEmpty()
        nextFollowUpDate.visibility = if (selected in listOf("Interested", "Cold", "Hot", "No Response")) View.VISIBLE else View.GONE
        meetingDate.visibility = if (selected == "Meeting Fix") View.VISIBLE else View.GONE
    }

    private fun saveFollowUp() {
        if (currentLead?.optString("assignedEmployeeId") != employeeId) { EmployeeUi.toast(this, "Only the currently assigned employee can update this follow-up."); return }
        val selected = status.selectedItem.toString()
        val remarkValue = remark.text.toString().trim()
        if (remarkValue.isEmpty()) { remark.error = "Remark is mandatory"; remark.requestFocus(); return }
        if (nextFollowUpDate.visibility == View.VISIBLE && nextFollowUpDate.text.toString().isBlank()) { EmployeeUi.toast(this, "Select the next follow-up date."); return }
        if (meetingDate.visibility == View.VISIBLE && meetingDate.text.toString().isBlank()) { EmployeeUi.toast(this, "Select the meeting date."); return }
        val body = JSONObject().put("action", "updateLeadRemark").put("leadId", leadId).put("employeeId", employeeId).put("status", selected).put("remark", remarkValue).put("nextFollowUpDate", nextFollowUpDate.text.toString()).put("meetingDate", meetingDate.text.toString())
        ApiClient.post(body) { ok, message, _ -> runOnUiThread { if (ok) { EmployeeUi.toast(this, "Follow-up updated."); load() } else EmployeeUi.toast(this, message) } }
    }

    private fun archiveLead() {
        ApiClient.post(JSONObject().put("action", "archiveEmployeeLead").put("leadId", leadId).put("employeeId", employeeId)) { ok, message, _ -> runOnUiThread { if (ok) finish() else EmployeeUi.toast(this, message) } }
    }

    private fun ensureCallLogSync(lead: JSONObject) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.READ_CALL_LOG), CALL_LOG_PERMISSION)
            return
        }
        syncCallLogs(lead)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CALL_LOG_PERMISSION && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) currentLead?.let { syncCallLogs(it) }
        else if (requestCode == CALL_LOG_PERMISSION) EmployeeUi.toast(this, "Call log permission is required to track lead call attempts automatically.")
    }

    private fun syncCallLogs(lead: JSONObject) {
        syncCompletedForView = true
        val targetPhone = normalizePhone(lead.optString("phone"))
        val assignedAt = try { Instant.parse(lead.optString("assignedAt")).toEpochMilli() } catch (_: Exception) { 0L }
        val calls = mutableListOf<JSONObject>()
        val projection = arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE)
        try {
            contentResolver.query(CallLog.Calls.CONTENT_URI, projection, "${CallLog.Calls.DATE} >= ?", arrayOf(assignedAt.toString()), "${CallLog.Calls.DATE} DESC")?.use { cursor ->
                val idIndex = cursor.getColumnIndexOrThrow(CallLog.Calls._ID); val numberIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
                val dateIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DATE); val durationIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION); val typeIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE)
                while (cursor.moveToNext()) {
                    if (cursor.getInt(typeIndex) != CallLog.Calls.OUTGOING_TYPE || normalizePhone(cursor.getString(numberIndex)) != targetPhone) continue
                    val duration = cursor.getLong(durationIndex).coerceAtLeast(0)
                    calls.add(JSONObject().put("action", "recordLeadCall").put("leadId", leadId).put("employeeId", employeeId).put("calledAt", Instant.ofEpochMilli(cursor.getLong(dateIndex)).toString()).put("durationSeconds", duration).put("connected", if (duration > 0) "Yes" else "No").put("source", "android-call-log").put("externalCallId", "${DeviceUtils.getAndroidId(this)}-${cursor.getLong(idIndex)}"))
                }
            }
        } catch (error: SecurityException) { EmployeeUi.toast(this, "Call log permission was denied."); return }
        if (calls.isEmpty()) return
        var completed = 0; var imported = 0
        calls.forEach { body ->
            ApiClient.post(body) { ok, _, response ->
                if (ok && response?.optBoolean("duplicate", false) != true) imported++
                completed++
                if (completed == calls.size) runOnUiThread { if (imported > 0) EmployeeUi.toast(this, "$imported call attempt(s) synced."); load() }
            }
        }
    }

    private fun normalizePhone(value: String) = value.filter { it.isDigit() }.takeLast(10)
    private fun formatDuration(seconds: Int): String { val minutes = seconds / 60; val rest = seconds % 60; return if (minutes > 0) "${minutes}m ${rest}s" else "${rest}s" }
}
