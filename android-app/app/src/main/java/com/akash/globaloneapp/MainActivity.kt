package com.akash.globaloneapp

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge

class MainActivity : ComponentActivity() {

    private val permissionPreferences by lazy {
        getSharedPreferences("GLOBAL_ONE_APP_PERMISSIONS", MODE_PRIVATE)
    }

    private val runtimePermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        requestUpdateInstallPermission()
    }

    private val installPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        completePermissionSetup()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        if (permissionPreferences.getBoolean(KEY_PERMISSION_SETUP_SHOWN, false)) {
            openLogin()
        } else {
            showPermissionIntroduction()
        }
    }

    private fun showPermissionIntroduction() {
        AlertDialog.Builder(this)
            .setTitle("Allow required permissions")
            .setMessage(
                "Global One needs location for office attendance, call-log access for lead call tracking, " +
                    "notifications for new leads and update alerts, and installation access for mandatory app updates."
            )
            .setCancelable(false)
            .setPositiveButton("Continue") { _, _ -> requestRuntimePermissions() }
            .show()
    }

    private fun requestRuntimePermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.READ_CALL_LOG
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions += Manifest.permission.POST_NOTIFICATIONS
            permissions += Manifest.permission.NEARBY_WIFI_DEVICES
        }
        runtimePermissionLauncher.launch(permissions.toTypedArray())
    }

    private fun requestUpdateInstallPermission() {
        if (packageManager.canRequestPackageInstalls()) {
            completePermissionSetup()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Allow mandatory app updates")
            .setMessage("On the next screen, enable ‘Allow from this source’ so required app versions can be installed without the Play Store.")
            .setCancelable(false)
            .setPositiveButton("Open Settings") { _, _ ->
                installPermissionLauncher.launch(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
                )
            }
            .show()
    }

    private fun completePermissionSetup() {
        permissionPreferences.edit().putBoolean(KEY_PERMISSION_SETUP_SHOWN, true).apply()
        openLogin()
    }

    private fun openLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }

    companion object {
        private const val KEY_PERMISSION_SETUP_SHOWN = "permission_setup_shown_v1"
    }
}
