package com.akash.globaloneapp

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings

object DeviceUtils {

    @SuppressLint("HardwareIds")
    fun getAndroidId(context: Context): String {
        // ANDROID_ID is intentionally used as this installation's device-binding key.
        // Keeping this value stable preserves existing employee registrations.
        return Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        ).orEmpty()
    }
}
