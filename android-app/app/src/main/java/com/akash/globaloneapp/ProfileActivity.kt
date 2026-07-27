package com.akash.globaloneapp

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class ProfileActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout
    private lateinit var session: SessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionManager(this)
        root = EmployeeUi.screen(this, "My Profile", "Personal and employment details", EmployeeUi.NAV_PROFILE, true)
        loadProfile()
    }

    private fun loadProfile() {
        showLoading()
        ApiClient.post(JSONObject().put("action", "getEmployeeProfile").put("employeeId", session.getEmployeeId())) { ok, message, response ->
            runOnUiThread {
                val employee = response?.optJSONObject("data")
                if (!ok || employee == null) {
                    showError(message.ifBlank { "Profile not found." })
                    return@runOnUiThread
                }
                session.updateProfile(employee.optString("fullName"), employee.optString("email"), employee.optString("department"), employee.optString("designation"))
                renderProfile(employee)
            }
        }
    }

    private fun showLoading() {
        root.removeAllViews()
        EmployeeUi.addCard(root, LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(32), dp(24), dp(32)); background = rounded("#FFFFFF", 22, "#E2E8F0")
            addView(ProgressBar(this@ProfileActivity).apply { isIndeterminate = true }, LinearLayout.LayoutParams(dp(42), dp(42)))
            addView(TextView(this@ProfileActivity).apply { text = "Loading your profile"; textSize = 15f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#334155")); setPadding(0, dp(14), 0, 0) })
        })
    }

    private fun showError(message: String) {
        AppToast.error(this, message.ifBlank { "Profile could not be loaded." })
        root.removeAllViews()
        EmployeeUi.addCard(root, EmployeeUi.card(this, "Unable to load profile", message, "#DC2626"))
        root.addView(EmployeeUi.button(this, "Try Again") { loadProfile() })
    }

    private fun renderProfile(employee: JSONObject) {
        root.removeAllViews()
        val fullName = value(employee, "fullName", "Employee")
        val designation = value(employee, "designation", "Employee")
        val department = value(employee, "department", "Department not assigned")
        val status = value(employee, "status", "Inactive")

        EmployeeUi.addCard(root, identityCard(fullName, designation, department, value(employee, "employeeId"), status))

        root.addView(sectionTitle("PERSONAL INFORMATION", "Your contact and personal details"))
        EmployeeUi.addCard(root, detailSection(listOf(
            Triple("Phone number", value(employee, "phone"), "Verified contact"),
            Triple("Email address", value(employee, "email"), "Work communication"),
            Triple("Date of birth", value(employee, "dob"), "Personal information"),
            Triple("Gender", value(employee, "gender"), "Personal information"),
            Triple("Address", value(employee, "address"), "Current address")
        )))

        root.addView(sectionTitle("WORK INFORMATION", "Your role and employment details"))
        EmployeeUi.addCard(root, detailSection(listOf(
            Triple("Employee ID", value(employee, "employeeId"), "Unique identification"),
            Triple("Department", department, "Assigned department"),
            Triple("Designation", designation, "Current role"),
            Triple("Joining date", value(employee, "joiningDate"), "Employment started")
        )))

        root.addView(EmployeeUi.button(this, "Sign Out Securely", "#DC2626") {
            session.logout()
            startActivity(Intent(this, LoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
            finish()
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply { topMargin = dp(4); bottomMargin = dp(18) })
    }

    private fun identityCard(name: String, designation: String, department: String, employeeId: String, status: String): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(22), dp(26), dp(22), dp(24))
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor("#172554"), Color.parseColor("#2563EB"), Color.parseColor("#0891B2"))).apply { cornerRadius = dp(26).toFloat() }
            elevation = dp(8).toFloat()
            addView(TextView(this@ProfileActivity).apply {
                text = name.take(1).uppercase().ifBlank { "E" }; textSize = 34f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE); background = rounded("#33FFFFFF", 50)
            }, LinearLayout.LayoutParams(dp(82), dp(82)))
            addView(TextView(this@ProfileActivity).apply { text = name; textSize = 24f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setPadding(0, dp(15), 0, dp(4)) })
            addView(TextView(this@ProfileActivity).apply { text = "$designation  •  $department"; textSize = 13f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#DBEAFE")) })
            addView(LinearLayout(this@ProfileActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(0, dp(15), 0, 0)
                addView(badge(employeeId, "#22FFFFFF", "#FFFFFF"))
                addView(badge(status, if (status.equals("Active", true)) "#2ECC71" else "#EF4444", "#FFFFFF"), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(8) })
            })
        }
    }

    private fun badge(textValue: String, backgroundColor: String, textColor: String) = TextView(this).apply {
        text = textValue; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(textColor)); background = rounded(backgroundColor, 20); setPadding(dp(11), dp(6), dp(11), dp(6))
    }

    private fun sectionTitle(title: String, subtitle: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(4), dp(12), dp(4), dp(10))
        addView(TextView(this@ProfileActivity).apply { text = title; textSize = 13f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#334155")); letterSpacing = .08f })
        addView(TextView(this@ProfileActivity).apply { text = subtitle; textSize = 12f; setTextColor(Color.parseColor("#94A3B8")); setPadding(0, dp(3), 0, 0) })
    }

    private fun detailSection(rows: List<Triple<String, String, String>>) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; background = rounded("#FFFFFF", 22, "#E2E8F0"); setPadding(dp(18), dp(5), dp(18), dp(5)); elevation = dp(3).toFloat()
        rows.forEachIndexed { index, row ->
            addView(LinearLayout(this@ProfileActivity).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(15), 0, dp(15))
                addView(TextView(this@ProfileActivity).apply { text = row.first.take(1); textSize = 16f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#2563EB")); background = rounded("#EFF6FF", 14) }, LinearLayout.LayoutParams(dp(42), dp(42)).apply { marginEnd = dp(13) })
                addView(LinearLayout(this@ProfileActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(TextView(this@ProfileActivity).apply { text = row.first; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#64748B")) })
                    addView(TextView(this@ProfileActivity).apply { text = row.second; textSize = 15f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#102A43")); setPadding(0, dp(3), 0, 0) })
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            })
            if (index < rows.lastIndex) addView(View(this@ProfileActivity).apply { setBackgroundColor(Color.parseColor("#E2E8F0")) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)).apply { marginStart = dp(55) })
        }
    }

    private fun value(employee: JSONObject, key: String, fallback: String = "Not provided"): String = employee.optString(key).trim().ifBlank { fallback }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }
}
