package com.akash.globaloneapp

import android.app.Application

class GlobalOneApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: GlobalOneApplication
            private set
    }
}
