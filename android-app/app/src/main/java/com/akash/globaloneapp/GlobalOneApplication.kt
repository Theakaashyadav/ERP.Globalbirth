package com.akash.globaloneapp

import android.app.Application
import android.app.Activity
import android.content.Intent
import android.os.Bundle

class GlobalOneApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            private var redirecting = false
            override fun onActivityResumed(activity: Activity) {
                if (activity is LoginActivity || activity is MainActivity || activity is RegisterActivity || activity is UpdateActivity) { if (activity is LoginActivity) redirecting = false; return }
                if (!SessionManager(activity).isLoggedIn() && !redirecting) { redirecting = true; activity.startActivity(Intent(activity, LoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)); activity.finish() }
            }
            override fun onActivityCreated(activity: Activity, state: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }

    companion object {
        lateinit var instance: GlobalOneApplication
            private set
    }
}
