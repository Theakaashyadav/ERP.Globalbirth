package com.akash.globaloneapp

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.Formatter
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class AttendanceActivity : AppCompatActivity() {

    private lateinit var tvClock: TextView
    private lateinit var etDate: EditText
    private lateinit var tvEmpName: TextView
    private lateinit var tvEmpId: TextView
    private lateinit var tvEmpDept: TextView
    private lateinit var tvEmpDesig: TextView
    private lateinit var tvWifiStatus: TextView
    private lateinit var btnSubmit: Button
    private lateinit var tvSuccess: TextView
    private lateinit var tvError: TextView

    private lateinit var session: SessionManager
    private val handler = Handler(Looper.getMainLooper())

    private val allowedWifiNames = listOf("Globalbirth", "Globalbirth_5G")
    private val officeIpPrefix = "192.168.1."

    private val compOffEligibleDays = listOf("Tuesday")

    private var isWifiVerified = false
    private var wifiMatchScore = 0

    private var currentWifiName = ""
    private var currentWifiBssid = ""
    private var currentWifiIp = ""
    private var currentLinkSpeed = ""
    private var currentFrequency = ""

    private var employeeId = ""
    private var fullName = ""
    private var department = ""
    private var designation = ""

    private data class AttendanceRule(
        val isCompOffEligibleDay: Boolean
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, true)
        setContentView(R.layout.activity_attendance)
        EmployeeUi.decorateExisting(this, EmployeeUi.NAV_ATTENDANCE, true, "Attendance", "Secure office check-in")

        session = SessionManager(this)

        tvClock = findViewById(R.id.tvClock)
        etDate = findViewById(R.id.etDate)
        tvEmpName = findViewById(R.id.tvEmpName)
        tvEmpId = findViewById(R.id.tvEmpId)
        tvEmpDept = findViewById(R.id.tvEmpDept)
        tvEmpDesig = findViewById(R.id.tvEmpDesig)
        tvWifiStatus = findViewById(R.id.tvWifiStatus)
        btnSubmit = findViewById(R.id.btnSubmit)
        tvSuccess = findViewById(R.id.tvSuccess)
        tvError = findViewById(R.id.tvError)

        setCheckingWifiUi()
        loadSessionEmployee()
        startClock()

        if (hasLocationPermission()) {
            updateWifiDetails()
        } else {
            requestLocationPermission()
        }

        btnSubmit.setOnClickListener {
            saveSelfAttendance()
        }
    }

    private fun loadSessionEmployee() {
        employeeId = session.getEmployeeId()
        fullName = session.getFullName()
        department = session.getDepartment()
        designation = session.getDesignation()

        tvEmpName.text = if (fullName.isNotEmpty()) fullName else "Employee not found"
        tvEmpId.text = if (employeeId.isNotEmpty()) employeeId else "-"
        tvEmpDept.text = if (department.isNotEmpty()) department else "-"
        tvEmpDesig.text = if (designation.isNotEmpty()) designation else "-"
    }

    private fun startClock() {
        handler.post(object : Runnable {
            override fun run() {
                val now = Date()

                tvClock.text = SimpleDateFormat("hh:mm:ss a", Locale.ENGLISH).format(now)
                etDate.setText(SimpleDateFormat("dd MMM yyyy", Locale.ENGLISH).format(now))

                handler.postDelayed(this, 1000)
            }
        })
    }

    private fun getCurrentAttendanceRule(): AttendanceRule {
        val now = Date()
        val dayName = SimpleDateFormat("EEEE", Locale.ENGLISH).format(now)

        val isCompOffEligibleDay = compOffEligibleDays.any {
            it.equals(dayName, ignoreCase = true)
        }

        return AttendanceRule(
            isCompOffEligibleDay = isCompOffEligibleDay
        )
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ),
            101
        )
    }

    private fun isLocationEnabled(): Boolean {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager

        return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    private fun updateWifiDetails() {
        try {
            setCheckingWifiUi()

            if (!hasLocationPermission()) {
                isWifiVerified = false
                wifiMatchScore = 0
                setWifiNotVerifiedUi("❌ Location Permission Required")
                return
            }

            if (!isLocationEnabled()) {
                isWifiVerified = false
                wifiMatchScore = 0
                setWifiNotVerifiedUi("❌ Please Turn ON Phone Location/GPS")
                return
            }

            val connectivityManager =
                getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)

            if (capabilities == null || !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                isWifiVerified = false
                wifiMatchScore = 0
                currentWifiName = "-"
                currentWifiBssid = "-"
                currentWifiIp = "-"
                currentLinkSpeed = "-"
                currentFrequency = "-"

                setWifiNotVerifiedUi("📶 Office WiFi Not Connected")
                return
            }

            val wifiManager =
                applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

            val oldWifiInfo = wifiManager.connectionInfo
            var newWifiInfo: WifiInfo? = null

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val transportInfo = capabilities.transportInfo
                if (transportInfo is WifiInfo) {
                    newWifiInfo = transportInfo
                }
            }

            val oldSsid = cleanWifiName(oldWifiInfo.ssid ?: "-")
            val newSsid = cleanWifiName(newWifiInfo?.ssid ?: "-")

            val finalWifiInfo =
                if (isValidSsid(oldSsid)) {
                    oldWifiInfo
                } else if (isValidSsid(newSsid)) {
                    newWifiInfo
                } else {
                    oldWifiInfo
                }

            currentWifiName = cleanWifiName(finalWifiInfo?.ssid ?: "-")
            currentWifiBssid = (finalWifiInfo?.bssid ?: "-").trim().lowercase(Locale.ENGLISH)
            currentWifiIp = Formatter.formatIpAddress(oldWifiInfo.ipAddress).trim()
            currentLinkSpeed = "${finalWifiInfo?.linkSpeed ?: 0} Mbps"
            currentFrequency = "${finalWifiInfo?.frequency ?: 0} MHz"

            val nameMatched = allowedWifiNames.any {
                currentWifiName.equals(it, ignoreCase = true)
            }

            val ipMatched = currentWifiIp.startsWith(officeIpPrefix)

            wifiMatchScore = 0
            if (nameMatched) wifiMatchScore++
            if (ipMatched) wifiMatchScore++

            isWifiVerified = nameMatched || ipMatched

            if (!isValidSsid(currentWifiName)) {
                if (ipMatched) {
                    isWifiVerified = true
                    wifiMatchScore = 1
                    setWifiVerifiedUi()
                } else {
                    isWifiVerified = false
                    wifiMatchScore = 0
                    setWifiNotVerifiedUi("❌ Office WiFi Not Verified")
                }
                return
            }

            if (isWifiVerified) {
                setWifiVerifiedUi()
            } else {
                setWifiNotVerifiedUi("❌ Office WiFi Not Verified")
            }

        } catch (e: Exception) {
            isWifiVerified = false
            wifiMatchScore = 0
            setWifiNotVerifiedUi("❌ WiFi Verification Failed")
        }
    }

    private fun cleanWifiName(ssid: String): String {
        return ssid
            .replace("\"", "")
            .trim()
    }

    private fun isValidSsid(ssid: String): Boolean {
        val value = ssid.trim().lowercase(Locale.ENGLISH)

        return value.isNotEmpty() &&
                value != "-" &&
                value != "<unknown ssid>" &&
                value != "unknown ssid"
    }

    private fun saveSelfAttendance() {
        hideMessages()

        if (!hasLocationPermission()) {
            showError("Location permission required to verify WiFi.")
            requestLocationPermission()
            return
        }

        if (!isLocationEnabled()) {
            showError("Please turn ON phone Location/GPS.")
            return
        }

        btnSubmit.isEnabled = false
        btnSubmit.text = "Processing..."

        updateWifiDetails()

        if (employeeId.isEmpty()) {
            btnSubmit.isEnabled = true
            btnSubmit.text = "Mark My Attendance"
            showError("Employee not logged in.")
            return
        }

        if (!isWifiVerified) {
            btnSubmit.isEnabled = true
            btnSubmit.text = "Mark My Attendance"
            showError("Please connect with office WiFi to mark attendance.")
            return
        }

        btnSubmit.text = "Saving..."

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.ENGLISH).format(Date())
        val time = SimpleDateFormat("hh:mm a", Locale.ENGLISH).format(Date())

        val attendanceRule = getCurrentAttendanceRule()

        val record = JSONObject().apply {
            put("employeeId", employeeId)
            put("date", today)
            put("time", time)
        }

        val data = JSONObject().apply {
            put("action", "saveAttendance")
            put("records", JSONArray().put(record))
        }

        ApiClient.post(data) { success, message, _ ->
            runOnUiThread {
                btnSubmit.text = "Mark My Attendance"

                if (success) {
                    tvSuccess.text =
                        if (attendanceRule.isCompOffEligibleDay) {
                            "Attendance marked successfully at $time. Tuesday comp off eligible."
                        } else {
                            "Attendance marked successfully at $time."
                        }

                    tvSuccess.visibility = View.VISIBLE
                    btnSubmit.isEnabled = false
                } else {
                    showError(message.ifEmpty { "Attendance not saved." })
                    btnSubmit.isEnabled = true
                }
            }
        }
    }

    private fun setCheckingWifiUi() {
        tvWifiStatus.text = "🔍 Checking Office WiFi..."
        tvWifiStatus.setBackgroundResource(R.drawable.status_blue)
        tvWifiStatus.setTextColor(ContextCompat.getColor(this, android.R.color.black))
    }

    private fun setWifiVerifiedUi() {
        tvWifiStatus.text = "✅ Office WiFi Verified"
        tvWifiStatus.setBackgroundResource(R.drawable.status_green)
        tvWifiStatus.setTextColor(ContextCompat.getColor(this, android.R.color.black))
    }

    private fun setWifiNotVerifiedUi(message: String) {
        tvWifiStatus.text = message
        tvWifiStatus.setBackgroundResource(R.drawable.status_red)
        tvWifiStatus.setTextColor(ContextCompat.getColor(this, android.R.color.black))
    }

    private fun showError(message: String) {
        tvError.text = "❌ $message"
        tvError.setTextColor(ContextCompat.getColor(this, android.R.color.black))
        tvError.visibility = View.VISIBLE
    }

    private fun hideMessages() {
        tvSuccess.visibility = View.GONE
        tvError.visibility = View.GONE
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (
            requestCode == 101 &&
            grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) {
            updateWifiDetails()
        } else {
            setWifiNotVerifiedUi("❌ Location Permission Denied")
            showError("Location permission is required to verify WiFi.")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
    }
}
