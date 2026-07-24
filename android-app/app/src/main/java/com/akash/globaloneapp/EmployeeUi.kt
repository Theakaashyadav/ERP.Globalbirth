package com.akash.globaloneapp

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.*
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

object EmployeeUi {
    private data class NavItem(val key: String, val icon: Int, val label: String)
    const val NAV_DASHBOARD = "dashboard"
    const val NAV_ATTENDANCE = "attendance"
    const val NAV_LEADS = "leads"
    const val NAV_ALERTS = "alerts"
    const val NAV_PROFILE = "profile"

    private const val NAVY = "#102A43"
    private const val BLUE = "#2563EB"
    private const val CYAN = "#0891B2"
    private const val GREEN = "#059669"
    private const val MUTED = "#64748B"
    private const val SURFACE = "#FFFFFF"
    private const val BACKGROUND = "#F3F6FB"

    fun dp(view: View, value: Int) = (value * view.resources.displayMetrics.density).toInt()
    private fun shape(color: String, radius: Float = 18f, stroke: String? = null): GradientDrawable = GradientDrawable().apply {
        setColor(Color.parseColor(color)); cornerRadius = radius
        if (stroke != null) setStroke(1, Color.parseColor(stroke))
    }

    fun screen(activity: Activity, title: String, subtitle: String, active: String, back: Boolean = false): LinearLayout {
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).isAppearanceLightStatusBars = false
        activity.window.statusBarColor = Color.parseColor(NAVY)
        activity.window.navigationBarColor = Color.WHITE
        val shell = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor(BACKGROUND)) }
        val header = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(this, 18), dp(this, 18), dp(this, 18), dp(this, 18))
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor(NAVY), Color.parseColor(BLUE))).apply { cornerRadii = floatArrayOf(0f,0f,0f,0f,32f,32f,32f,32f) }
        }
        ViewCompat.setOnApplyWindowInsetsListener(header) { view, insets ->
            val top = insets.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()).top
            view.setPadding(dp(view,18), top + dp(view,18), dp(view,18), dp(view,18))
            insets
        }
        if (back) header.addView(TextView(activity).apply {
            text = "‹"; textSize = 38f; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setPadding(0,0,dp(this,14),0); setOnClickListener { activity.onBackPressed() }
        }, LinearLayout.LayoutParams(dp(header, 45), dp(header, 52)))
        header.addView(LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(activity).apply { text = title; textSize = 23f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE) })
            addView(TextView(activity).apply { text = subtitle; textSize = 13f; setTextColor(Color.parseColor("#DCEAFE")); setPadding(0,dp(this,3),0,0) })
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        shell.addView(header)

        val content = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(this,16),dp(this,18),dp(this,16),dp(this,24)) }
        shell.addView(ScrollView(activity).apply { isFillViewport = true; addView(content) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        shell.addView(footer(activity, active))
        activity.setContentView(shell)
        return content
    }

    fun decorateExisting(activity: Activity, active: String? = null, back: Boolean = false, title: String? = null, subtitle: String = "") {
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).isAppearanceLightStatusBars = false
        activity.window.statusBarColor = Color.parseColor(NAVY)
        val frame = activity.findViewById<FrameLayout>(android.R.id.content)
        if (frame.childCount == 0) return
        val original = frame.getChildAt(0)
        frame.removeView(original)
        original.fitsSystemWindows = false
        val shell = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor(BACKGROUND)) }
        if (back && title != null) shell.addView(standardHeader(activity, title, subtitle))
        else if (back) shell.addView(TextView(activity).apply {
            text = "‹  Back"; textSize = 16f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER_VERTICAL
            setTextColor(Color.WHITE); setBackgroundColor(Color.parseColor(NAVY)); setPadding(dp(this,18),dp(this,10),dp(this,18),dp(this,10))
            setOnClickListener { activity.onBackPressed() }
            ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
                val top = insets.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()).top
                view.setPadding(dp(view,18), top + dp(view,10), dp(view,18), dp(view,10))
                view.layoutParams = view.layoutParams?.apply { height = top + dp(view,48) }
                insets
            }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(shell,48)))
        shell.addView(original, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1f))
        if (active != null) shell.addView(footer(activity, active))
        frame.addView(shell)
    }

    private fun standardHeader(activity: Activity, title: String, subtitle: String): View = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(this,18),dp(this,18),dp(this,18),dp(this,18))
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.parseColor(NAVY), Color.parseColor(BLUE))).apply { cornerRadii = floatArrayOf(0f,0f,0f,0f,32f,32f,32f,32f) }
        addView(TextView(activity).apply {
            text = "‹"; textSize = 38f; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setPadding(0,0,dp(this,14),0); setOnClickListener { activity.onBackPressed() }
        }, LinearLayout.LayoutParams(dp(this,45),dp(this,52)))
        addView(LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(activity).apply { text = title; textSize = 23f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE) })
            addView(TextView(activity).apply { text = subtitle; textSize = 13f; setTextColor(Color.parseColor("#DCEAFE")); setPadding(0,dp(this,3),0,0) })
        }, LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f))
        ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
            val top = insets.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()).top
            view.setPadding(dp(view,18),top+dp(view,18),dp(view,18),dp(view,18)); insets
        }
    }

    private fun footer(activity: Activity, active: String): View {
        val bar = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(dp(this,8),dp(this,7),dp(this,8),dp(this,8)); setBackgroundColor(Color.WHITE); elevation = dp(this,16).toFloat() }
        ViewCompat.setOnApplyWindowInsetsListener(bar) { view, insets ->
            val bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            view.setPadding(dp(view,6),dp(view,7),dp(view,6),bottom+dp(view,8))
            view.layoutParams = view.layoutParams?.apply { height = bottom + dp(view,73) }
            insets
        }
        val session = SessionManager(activity)
        val destinations = mutableListOf(NavItem(NAV_DASHBOARD, R.drawable.ic_nav_home, "Home"))
        if (session.hasMobileFeature("attendance")) destinations.add(NavItem(NAV_ATTENDANCE, R.drawable.ic_dashboard_attendance, "Attendance"))
        if (session.hasMobileFeature("leads")) destinations.add(NavItem(NAV_LEADS, R.drawable.ic_dashboard_leads, "Leads"))
        if (session.hasMobileFeature("alerts")) destinations.add(NavItem(NAV_ALERTS, R.drawable.ic_nav_alerts, "Alerts"))
        if (session.hasMobileFeature("profile")) destinations.add(NavItem(NAV_PROFILE, R.drawable.ic_dashboard_profile, "Profile"))
        destinations.forEach { item ->
            val selected = item.key == active
            val badgeCount = when (item.key) { NAV_LEADS -> BadgeStore.leadCount(activity); NAV_ALERTS -> BadgeStore.alertCount(activity); else -> 0 }
            bar.addView(LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(this,4),dp(this,4),dp(this,4),dp(this,2))
                if (selected) background = shape("#EFF6FF", 18f)
                addView(FrameLayout(activity).apply {
                    clipChildren = false; clipToPadding = false
                    addView(FrameLayout(activity).apply {
                        if (selected) background = shape(BLUE, 50f)
                        addView(ImageView(activity).apply { setImageResource(item.icon); setColorFilter(Color.parseColor(if(selected) "#FFFFFF" else MUTED)); setPadding(dp(this,7),dp(this,7),dp(this,7),dp(this,7)) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT))
                    }, FrameLayout.LayoutParams(dp(this,34), dp(this,34), Gravity.CENTER))
                    addView(TextView(activity).apply {
                        text = if (badgeCount > 99) "99+" else badgeCount.toString(); textSize = 8.5f; gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD
                        setTextColor(Color.WHITE); background = shape("#DC2626", 50f); setPadding(dp(this,5),0,dp(this,5),0); tag = "footer_badge_${item.key}"; visibility = if (badgeCount > 0) View.VISIBLE else View.GONE
                    }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(this,19), Gravity.END or Gravity.TOP))
                }, LinearLayout.LayoutParams(dp(this,42),dp(this,36)))
                addView(TextView(activity).apply { text = item.label; textSize = 10.5f; gravity = Gravity.CENTER; typeface = if(selected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT; setTextColor(Color.parseColor(if(selected) BLUE else MUTED)); setPadding(0,dp(this,2),0,0) })
                setOnClickListener { navigate(activity, item.key, active) }
            }, LinearLayout.LayoutParams(0, dp(bar,59), 1f).apply { marginStart=dp(bar,2); marginEnd=dp(bar,2) })
        }
        return bar
    }

    fun refreshBadges(activity: Activity) {
        mapOf(NAV_LEADS to BadgeStore.leadCount(activity), NAV_ALERTS to BadgeStore.alertCount(activity)).forEach { (key, count) ->
            activity.window.decorView.findViewWithTag<TextView>("footer_badge_$key")?.apply {
                visibility = if (count > 0) View.VISIBLE else View.GONE
                if (count > 0) text = if (count > 99) "99+" else count.toString()
            }
        }
    }

    private fun navigate(activity: Activity, target: String, current: String) {
        if (target == current) return
        val session = SessionManager(activity)
        val requiredFeature = when(target) { NAV_ATTENDANCE -> "attendance"; NAV_LEADS -> "leads"; NAV_ALERTS -> "alerts"; NAV_PROFILE -> "profile"; else -> "" }
        if (requiredFeature.isNotEmpty() && !session.hasMobileFeature(requiredFeature)) {
            toast(activity, "This feature is not enabled for your role.")
            return
        }
        val type = when(target) { NAV_ATTENDANCE -> AttendanceActivity::class.java; NAV_LEADS -> LeadsActivity::class.java; NAV_ALERTS -> AlertsActivity::class.java; NAV_PROFILE -> ProfileActivity::class.java; else -> DashboardActivity::class.java }
        activity.startActivity(Intent(activity, type).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }

    fun card(activity: Activity, title: String, body: String, accent: String = BLUE, click: (() -> Unit)? = null): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(this,20),dp(this,18),dp(this,20),dp(this,18)); background = shape(SURFACE, 22f, "#E2E8F0"); elevation = dp(this,3).toFloat()
        addView(TextView(activity).apply { text=title; textSize=18f; typeface=Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent)) })
        addView(TextView(activity).apply { text=body; textSize=14f; setTextColor(Color.parseColor(MUTED)); setPadding(0,dp(this,7),0,0); setLineSpacing(2f,1f) })
        if(click!=null){ isClickable=true; isFocusable=true; setOnClickListener { click() } }
    }

    fun actionTile(activity: Activity, icon: String, title: String, accent: String = BLUE, click: () -> Unit): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(dp(this,12),dp(this,18),dp(this,12),dp(this,16))
        background = shape(SURFACE,22f,"#E2E8F0")
        elevation = dp(this,3).toFloat()
        addView(TextView(activity).apply {
            text = icon; textSize = 34f; gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(accent))
            background = shape("#EFF6FF",50f)
        }, LinearLayout.LayoutParams(dp(this,66),dp(this,66)))
        addView(TextView(activity).apply {
            text = title; textSize = 15f; gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(NAVY)); setPadding(0,dp(this,11),0,0)
        })
        isClickable = true; isFocusable = true; setOnClickListener { click() }
    }

    fun addTileRow(parent: LinearLayout, left: View, right: View) {
        parent.addView(LinearLayout(parent.context).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(left, LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f).apply { marginEnd=dp(parent,7) })
            addView(right, LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f).apply { marginStart=dp(parent,7) })
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin=dp(parent,14) })
    }

    fun addCard(parent: LinearLayout, card: View) { parent.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin=dp(parent,14) }) }
    fun section(activity: Activity, value: String) = TextView(activity).apply { text=value; textSize=13f; typeface=Typeface.DEFAULT_BOLD; setTextColor(Color.parseColor(MUTED)); setPadding(dp(this,4),dp(this,10),0,dp(this,12)); letterSpacing=.08f }
    fun text(context: android.content.Context, value: String, size: Float = 15f) = TextView(context).apply { text=value; textSize=size; setTextColor(Color.parseColor(NAVY)); setPadding(dp(this,2),dp(this,9),dp(this,2),dp(this,9)); setLineSpacing(2f,1f) }
    fun input(context: android.content.Context, hintText: String, lines: Int = 1) = EditText(context).apply { hint=hintText; minLines=lines; setTextColor(Color.parseColor(NAVY)); setHintTextColor(Color.parseColor("#94A3B8")); setPadding(dp(this,15),dp(this,13),dp(this,15),dp(this,13)); background=shape("#F8FAFC",16f,"#CBD5E1") }
    fun button(context: android.content.Context, label: String, tone: String = BLUE, click: () -> Unit) = Button(context).apply { text=label; isAllCaps=false; textSize=15f; typeface=Typeface.DEFAULT_BOLD; setTextColor(Color.WHITE); background=shape(tone,18f); setPadding(dp(this,12),dp(this,12),dp(this,12),dp(this,12)); setOnClickListener { click() } }
    fun toast(context: android.content.Context, value: String) = AppToast.smart(context, value)
}
