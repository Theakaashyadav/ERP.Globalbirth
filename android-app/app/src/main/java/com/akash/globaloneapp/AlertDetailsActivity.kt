package com.akash.globaloneapp

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class AlertDetailsActivity : AppCompatActivity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val subject = intent.getStringExtra("subject").orEmpty().ifBlank { "Alert" }
        val message = intent.getStringExtra("message").orEmpty()
        val sender = intent.getStringExtra("sender").orEmpty().ifBlank { "SYSTEM" }
        val dateTime = intent.getStringExtra("dateTime").orEmpty()
        val root = EmployeeUi.screen(this, "Alert Details", "Complete message", EmployeeUi.NAV_ALERTS, true)
        EmployeeUi.addCard(root, LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(22), dp(20), dp(22)); background = rounded("#FFFFFF", 24, "#D8E2F0")
            addView(TextView(this@AlertDetailsActivity).apply { text = "ALERT MESSAGE"; textSize = 11f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#7C3AED")); letterSpacing = .12f })
            addView(TextView(this@AlertDetailsActivity).apply { text = subject; textSize = 23f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#0F172A")); setPadding(0, dp(10), 0, dp(18)) })
            addView(LinearLayout(this@AlertDetailsActivity).apply {
                orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(12), dp(14), dp(12)); background = rounded("#F5F3FF", 16)
                addView(meta("Sent by", sender)); addView(meta("Date & time", dateTime).apply { setPadding(0, dp(8), 0, 0) })
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(20) })
            addView(TextView(this@AlertDetailsActivity).apply { text = "Full message"; textSize = 13f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#475569")); setPadding(0, 0, 0, dp(9)) })
            addView(TextView(this@AlertDetailsActivity).apply { text = message; textSize = 16f; setTextColor(Color.parseColor("#1E293B")); setLineSpacing(dp(4).toFloat(), 1f); gravity = Gravity.START })
        })
    }
    private fun meta(label: String, value: String) = TextView(this).apply { text = "$label  •  $value"; textSize = 13f; setTextColor(Color.parseColor("#5B21B6")); typeface = Typeface.DEFAULT_BOLD }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun rounded(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat(); if (stroke != null) setStroke(dp(1), Color.parseColor(stroke)) }
}
