package com.akash.globaloneapp

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

object AppToast {
    enum class Type { SUCCESS, ERROR, WARNING, INFO }
    private const val TAG = "global_one_app_toast"

    fun success(context: Context, message: String) = show(context, message, Type.SUCCESS)
    fun error(context: Context, message: String) = show(context, message, Type.ERROR)
    fun warning(context: Context, message: String) = show(context, message, Type.WARNING)
    fun info(context: Context, message: String) = show(context, message, Type.INFO)

    fun smart(context: Context, message: String) {
        val value = message.lowercase()
        val type = when {
            listOf("success", "saved", "updated", "synced", "assigned successfully", "marked").any(value::contains) -> Type.SUCCESS
            listOf("failed", "error", "unable", "cannot", "could not", "denied", "not found", "inactive", "expired").any(value::contains) -> Type.ERROR
            listOf("required", "select", "enter", "complete", "waiting", "already", "valid ").any(value::contains) -> Type.WARNING
            else -> Type.INFO
        }
        show(context, message, type)
    }

    fun show(context: Context, message: String, type: Type = Type.INFO) {
        val activity = context.findActivity()
        if (activity == null) { Toast.makeText(context, message, Toast.LENGTH_LONG).show(); return }
        activity.runOnUiThread {
            val host = activity.findViewById<FrameLayout>(android.R.id.content)
            host.findViewWithTag<View>(TAG)?.let(host::removeView)
            val accent = when (type) { Type.SUCCESS -> "#16A34A"; Type.ERROR -> "#DC2626"; Type.WARNING -> "#D97706"; Type.INFO -> "#2563EB" }
            val soft = when (type) { Type.SUCCESS -> "#F0FDF4"; Type.ERROR -> "#FEF2F2"; Type.WARNING -> "#FFFBEB"; Type.INFO -> "#EFF6FF" }
            val symbol = when (type) { Type.SUCCESS -> "✓"; Type.ERROR -> "!"; Type.WARNING -> "!"; Type.INFO -> "i" }
            val density = activity.resources.displayMetrics.density
            fun dp(value: Int) = (value * density).toInt()
            val card = LinearLayout(activity).apply {
                tag = TAG; orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; elevation = dp(14).toFloat()
                setPadding(dp(12), dp(11), dp(14), dp(11))
                background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(16).toFloat(); setStroke(dp(1), Color.parseColor("#E2E8F0")) }
                addView(TextView(activity).apply {
                    text = symbol; textSize = 16f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent))
                    background = GradientDrawable().apply { setColor(Color.parseColor(soft)); shape = GradientDrawable.OVAL }
                }, LinearLayout.LayoutParams(dp(36), dp(36)).apply { marginEnd = dp(11) })
                addView(TextView(activity).apply {
                    text = message; textSize = 13.5f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor("#1E293B")); maxLines = 4
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                addView(TextView(activity).apply {
                    text = "×"; textSize = 20f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#94A3B8")); setOnClickListener { (parent as? ViewGroup)?.removeView(this) }
                }, LinearLayout.LayoutParams(dp(30), dp(36)).apply { marginStart = dp(5) })
            }
            host.addView(card, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP).apply { topMargin = dp(58); marginEnd = dp(14); marginStart = dp(14) })
            card.alpha = 0f; card.translationY = -dp(18).toFloat(); card.animate().alpha(1f).translationY(0f).setDuration(220).start()
            Handler(Looper.getMainLooper()).postDelayed({
                if (card.parent === host) card.animate().alpha(0f).translationY(-dp(12).toFloat()).setDuration(180).withEndAction { if (card.parent === host) host.removeView(card) }.start()
            }, 3_500L)
        }
    }

    private fun Context.findActivity(): Activity? {
        var current: Context? = this
        while (current is ContextWrapper) {
            if (current is Activity) return current
            current = current.baseContext
        }
        return null
    }
}
