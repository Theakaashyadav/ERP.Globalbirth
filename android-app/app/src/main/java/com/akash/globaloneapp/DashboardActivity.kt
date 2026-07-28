package com.akash.globaloneapp

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class DashboardActivity : AppCompatActivity() {
    private var updateCheckInProgress = false
    private var updateCheckScheduled = false
    private val updateHandler = Handler(Looper.getMainLooper())
    private var assignedLeadCount = 0
    private var leadAlertCount = 0
    private var featureAccessLoaded = false
    private var featureAccessRequest = 0
    private val alertPoller = object : Runnable {
        override fun run() {
            if (!isFinishing && !isDestroyed) loadLeadBadgeCounts(SessionManager(this@DashboardActivity))
            updateHandler.postDelayed(this, 15_000L)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val session = SessionManager(this)
        PushNotifications.activate(this, session)
        LeadAlertScheduler.schedule(this)
        assignedLeadCount = BadgeStore.leadCount(this)
        leadAlertCount = BadgeStore.alertCount(this)
        renderDashboard(session)
        loadFeatureAccess(session)
        ApiClient.post(JSONObject().put("action", "getEmployeeProfile").put("employeeId", session.getEmployeeId())) { ok, _, response ->
            runOnUiThread {
                val employee = response?.optJSONObject("data")
                if (ok && employee != null) {
                    session.updateProfile(employee.optString("fullName"), employee.optString("email"), employee.optString("department"), employee.optString("designation"))
                }
                if (ok && employee != null) renderDashboard(session)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        loadFeatureAccess(SessionManager(this))
        updateHandler.removeCallbacks(alertPoller)
        alertPoller.run()
        if (!updateCheckScheduled) {
            updateCheckScheduled = true
            updateHandler.postDelayed({
                if (!isFinishing && !isDestroyed) checkMandatoryUpdate()
            }, 5_000L)
        }
    }

    override fun onPause() {
        updateHandler.removeCallbacks(alertPoller)
        super.onPause()
    }

    private fun loadLeadBadgeCounts(session: SessionManager) {
        if (!session.hasMobileFeature("leads") && !session.hasMobileFeature("alerts")) return
        ApiClient.post(JSONObject().put("action", "getEmployeeLeads").put("employeeId", session.getEmployeeId())) { ok, _, response ->
            if (!ok) return@post
            val leads = response?.optJSONArray("data") ?: return@post
            val alerts = AlertReadStore.unreadLeadCount(this, leads, session.getEmployeeId())
            assignedLeadCount = BadgeStore.pendingFirstCallCount(leads)
            ApiClient.post(JSONObject().put("action", "getEmployeeAlerts").put("employeeId", session.getEmployeeId())) { alertOk, _, alertResponse ->
                val announcements = alertResponse?.optJSONArray("data")
                var unreadAnnouncements = 0
                var newestUnread: JSONObject? = null
                if (alertOk && announcements != null) for (index in 0 until announcements.length()) {
                    val item = announcements.optJSONObject(index) ?: continue
                    if (!item.optBoolean("isRead")) { unreadAnnouncements++; if (newestUnread == null) newestUnread = item }
                }
                val unreadUpdate = AlertReadStore.latestUpdate(this)?.let { if (it.versionCode > BuildConfig.VERSION_CODE && !AlertReadStore.isRead(this, it.key)) 1 else 0 } ?: 0
                leadAlertCount = alerts + unreadAnnouncements + unreadUpdate
                BadgeStore.set(this, assignedLeadCount, leadAlertCount)
                runOnUiThread { if (!isFinishing && !isDestroyed) { renderDashboard(session); newestUnread?.let { showAlertNotificationIfNeeded(it) } } }
            }
        }
    }

    private fun showAlertNotificationIfNeeded(item: JSONObject) {
        val id = item.optString("id"); if (id.isBlank()) return
        val preferences = getSharedPreferences("common_alert_delivery", MODE_PRIVATE)
        if (preferences.getString("lastAlertId", "") == id) return
        preferences.edit().putString("lastAlertId", id).apply()
        val title = item.optString("subject").ifBlank { "New Alert" }
        val body = item.optString("message").ifBlank { "Open Alerts to read the message." }
        val senderRole = item.optString("sentByRole").uppercase()
        val senderName = item.optString("sentByName")
        val sender = if (senderName.isBlank()) senderRole else "$senderRole • $senderName"
        val details = Intent(this, AlertDetailsActivity::class.java).putExtra("subject", title).putExtra("message", body).putExtra("sender", sender).putExtra("dateTime", "New alert").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(this, id.hashCode(), details, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val manager = getSystemService(NotificationManager::class.java)
        AppNotificationChannels.ensure(this, AppNotificationChannels.EMPLOYEE_ALERTS, "Employee alerts", "Important messages from Admin, HR and Marketing")
        manager.notify(id.hashCode(), NotificationCompat.Builder(this, AppNotificationChannels.EMPLOYEE_ALERTS).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body)).setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_MESSAGE).setAutoCancel(true).setNumber(BadgeStore.total(this)).setContentIntent(pending).build())
    }

    private fun loadFeatureAccess(session: SessionManager) {
        val requestId = ++featureAccessRequest
        featureAccessLoaded = false
        renderDashboard(session)
        ApiClient.post(JSONObject()
            .put("action", "getEmployeeMobileFeatures")
            .put("employeeId", session.getEmployeeId())
            .put("androidId", session.getAndroidId())) { ok, _, response ->
            if (!ok || requestId != featureAccessRequest) return@post
            val values = mutableSetOf<String>()
            val features = response?.optJSONObject("data")?.optJSONArray("features")
            if (features != null) for (index in 0 until features.length()) values.add(features.optString(index))
            session.saveMobileFeatures(values)
            featureAccessLoaded = true
            runOnUiThread { if (!isFinishing && !isDestroyed) renderDashboard(session) }
        }
    }

    override fun onDestroy() {
        updateHandler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun checkMandatoryUpdate() {
        if (updateCheckInProgress) return
        updateCheckInProgress = true
        val session = SessionManager(this)
        val url = Uri.parse(AppConfig.API_URL.substringBeforeLast("/attendance") + "/app-update/latest").buildUpon()
            .appendQueryParameter("employeeId", session.getEmployeeId())
            .appendQueryParameter("androidId", DeviceUtils.getAndroidId(this)).build().toString()
        val request = Request.Builder().url(url).apply { if (AppConfig.API_KEY.isNotBlank()) header("Authorization", "Bearer ${AppConfig.API_KEY}") }.build()
        OkHttpClient().newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) { updateCheckInProgress = false }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val json = try { JSONObject(it.body?.string().orEmpty()) } catch (_: Exception) { null }
                    updateCheckInProgress = false
                    val versionCode = json?.optJSONObject("release")?.optInt("versionCode") ?: 0
                    if (it.isSuccessful && json?.optBoolean("available") == true && versionCode > BuildConfig.VERSION_CODE) {
                        runOnUiThread { startActivity(Intent(this@DashboardActivity, UpdateActivity::class.java).putExtra("afterLogin", true)) }
                    }
                }
            }
        })
    }

    private fun renderDashboard(session: SessionManager) {
        val name = session.getFullName().ifBlank { "Employee" }
        val department = session.getDepartment().ifBlank { "Department not assigned" }
        val root = EmployeeUi.screen(this, "Employee Dashboard", "Your secure workspace", EmployeeUi.NAV_DASHBOARD)
        EmployeeUi.addCard(root, welcomeCard(session, name, department))
        root.addView(EmployeeUi.section(this, "YOUR WORKSPACE"))
        val tiles = mutableListOf<View>()
        if (session.hasMobileFeature("attendance")) tiles.add(modernActionCard(R.drawable.ic_dashboard_attendance, "Attendance", "Mark attendance and review your records", "#059669", "#ECFDF5") { startActivity(Intent(this, AttendanceActivity::class.java)) })
        if (featureAccessLoaded && session.hasMobileFeature("officeWifi")) tiles.add(modernActionCard(R.drawable.ic_dashboard_wifi, "Set Office Wi-Fi", "Submit a connected office network for admin approval", "#0891B2", "#ECFEFF") { startActivity(Intent(this, SetOfficeWifiActivity::class.java)) })
        if (session.hasMobileFeature("leads")) tiles.add(modernActionCard(R.drawable.ic_dashboard_leads, "Assigned Leads", if (session.isTeamLead()) "Call leads or assign them to your executives" else "Call and update your assigned prospects", "#7C3AED", "#F5F3FF", assignedLeadCount) { startActivity(Intent(this, LeadsActivity::class.java)) })
        if (session.hasMobileFeature("alerts")) tiles.add(modernActionCard(R.drawable.ic_nav_alerts, "Alerts", "Company messages, updates and lead reminders", "#D97706", "#FFFBEB", leadAlertCount) { startActivity(Intent(this, AlertsActivity::class.java)) })
        if (session.hasMobileFeature("profile")) tiles.add(modernActionCard(R.drawable.ic_dashboard_profile, "My Profile", "View your personal and employment information", "#2563EB", "#EFF6FF") { startActivity(Intent(this, ProfileActivity::class.java)) })
        val signOut = modernActionCard(R.drawable.ic_dashboard_logout, "Sign Out", "Securely end this employee session", "#DC2626", "#FEF2F2") {
            session.logout(); startActivity(Intent(this, LoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)); finish()
        }
        tiles.add(signOut)
        tiles.forEach { EmployeeUi.addCard(root, it) }
    }

    private fun welcomeCard(session: SessionManager, name: String, department: String): View {
        val role = session.getDesignation().ifBlank { department }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#172554"), Color.parseColor("#2563EB"), Color.parseColor("#0891B2"))).apply { cornerRadius = dp(24).toFloat() }
            elevation = dp(8).toFloat()
            addView(TextView(this@DashboardActivity).apply {
                text = name.trim().take(1).uppercase().ifBlank { "E" }; textSize = 28f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE)
                background = rounded("#33FFFFFF", 50)
            }, LinearLayout.LayoutParams(dp(66), dp(66)).apply { marginEnd = dp(16) })
            addView(LinearLayout(this@DashboardActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@DashboardActivity).apply { text = "Welcome back"; textSize = 13f; setTextColor(Color.parseColor("#BFDBFE")) })
                addView(TextView(this@DashboardActivity).apply { text = name; textSize = 21f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE); setPadding(0, dp(2), 0, dp(5)) })
                addView(TextView(this@DashboardActivity).apply { text = "$role  •  ${session.getEmployeeId()}"; textSize = 12f; setTextColor(Color.parseColor("#E0F2FE")); background = rounded("#22FFFFFF", 20); setPadding(dp(10), dp(5), dp(10), dp(5)) })
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
    }

    private fun modernActionCard(icon: Int, title: String, subtitle: String, accent: String, soft: String, badgeCount: Int = 0, click: () -> Unit): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; isClickable = true; isFocusable = true
            setPadding(dp(16), dp(16), dp(15), dp(16)); background = rounded("#FFFFFF", 22, "#E2E8F0"); elevation = dp(3).toFloat(); setOnClickListener { click() }
            addView(FrameLayout(this@DashboardActivity).apply {
                background = rounded(accent, 17)
                addView(ImageView(this@DashboardActivity).apply { setImageResource(icon); setPadding(dp(13), dp(13), dp(13), dp(13)) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }, LinearLayout.LayoutParams(dp(58), dp(58)).apply { marginEnd = dp(15) })
            addView(LinearLayout(this@DashboardActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@DashboardActivity).apply { text = title; textSize = 17f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#102A43")) })
                addView(TextView(this@DashboardActivity).apply { text = subtitle; textSize = 12.5f; setTextColor(Color.parseColor("#64748B")); setPadding(0, dp(4), 0, 0); maxLines = 2 })
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            if (badgeCount > 0) addView(TextView(this@DashboardActivity).apply {
                text = if (badgeCount > 99) "99+" else badgeCount.toString(); textSize = 12f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.WHITE); background = rounded("#DC2626", 50); setPadding(dp(8), dp(4), dp(8), dp(4))
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(28)).apply { marginStart = dp(8) })
            addView(FrameLayout(this@DashboardActivity).apply {
                background = rounded(soft, 50)
                addView(ImageView(this@DashboardActivity).apply { setImageResource(R.drawable.ic_chevron_right); setColorFilter(Color.parseColor(accent)); setPadding(dp(9), dp(9), dp(9), dp(9)) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            }, LinearLayout.LayoutParams(dp(38), dp(38)).apply { marginStart = dp(10) })
        }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }
}
