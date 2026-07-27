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

    private val compOffEligibleDays = listOf("Tuesday")

    private var isWifiVerified = false
    private var wifiMatchScore = 0
    private var wifiSettingsLoaded = false
    private var matchedOffice: OfficeWifi? = null
    private var approvedOffices = emptyList<OfficeWifi>()

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

    private data class OfficeWifi(
        val officeId: String,
        val name: String,
        val ssid: String,
        val bssid: String,
        val ipPrefix: String
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

        loadOfficeWifiSettings()

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
        val locationGranted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val nearbyGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) == PackageManager.PERMISSION_GRANTED
        return locationGranted && nearbyGranted
    }

    private fun requestLocationPermission() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions += Manifest.permission.NEARBY_WIFI_DEVICES
        ActivityCompat.requestPermissions(
            this,
            permissions.toTypedArray(),
            101
        )
    }

    private fun isLocationEnabled(): Boolean {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager

        return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    private fun loadOfficeWifiSettings() {
        wifiSettingsLoaded = false
        isWifiVerified = false
        btnSubmit.isEnabled = false
        setCheckingWifiUi()
        val data = JSONObject().apply {
            put("action", "getEmployeeOfficeWifiSettings")
            put("employeeId", employeeId)
        }
        ApiClient.post(data) { success, message, response ->
            runOnUiThread {
                if (!success) {
                    setWifiNotVerifiedUi(message.ifEmpty { "Office WiFi settings unavailable" })
                    return@runOnUiThread
                }
                val offices = response?.optJSONObject("data")?.optJSONArray("offices") ?: JSONArray()
                approvedOffices = (0 until offices.length()).mapNotNull { index ->
                    offices.optJSONObject(index)?.let { office ->
                        OfficeWifi(
                            office.optString("officeId"), office.optString("name"),
                            cleanWifiName(office.optString("ssid")),
                            office.optString("bssid").trim().lowercase(Locale.ENGLISH),
                            office.optString("ipPrefix").trim()
                        )
                    }
                }
                wifiSettingsLoaded = true
                if (approvedOffices.isEmpty()) {
                    setWifiNotVerifiedUi("No office WiFi configured by admin")
                } else if (hasLocationPermission()) {
                    updateWifiDetails()
                } else {
                    requestLocationPermission()
                }
            }
        }
    }

    private fun updateWifiDetails() {
        try {
            setCheckingWifiUi()

            if (!wifiSettingsLoaded) {
                setWifiNotVerifiedUi("Loading approved office WiFi...")
                return
            }

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

            val snapshot = WifiNetworkReader.read(this)
            currentWifiName = snapshot.ssid.ifBlank { "-" }
            currentWifiBssid = snapshot.bssid.ifBlank { "-" }
            currentWifiIp = snapshot.privateIp.ifBlank { "-" }
            currentLinkSpeed = "-"
            currentFrequency = "-"

            matchedOffice = approvedOffices.firstOrNull { office ->
                val ssidMatches = office.ssid.isNotBlank() && currentWifiName.equals(office.ssid, ignoreCase = true)
                val bssidMatches = office.bssid.isNotBlank() && currentWifiBssid.equals(office.bssid, ignoreCase = true)
                val networkMatches = office.ipPrefix.isNotBlank() && currentWifiIp.startsWith(office.ipPrefix)
                bssidMatches || (ssidMatches && (office.ipPrefix.isBlank() || networkMatches)) || (office.ssid.isBlank() && networkMatches)
            }
            val ipMatched = matchedOffice != null
            wifiMatchScore = if (matchedOffice == null) 0 else 1
            isWifiVerified = matchedOffice != null

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

        if (!wifiSettingsLoaded) {
            showError("Approved office WiFi is still loading. Please retry.")
            loadOfficeWifiSettings()
            return
        }

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
            put("officeId", matchedOffice?.officeId ?: "")
            put("wifiSsid", currentWifiName.takeUnless { it == "-" } ?: "")
            put("wifiBssid", currentWifiBssid.takeUnless { it == "-" } ?: "")
            put("wifiPrivateIp", currentWifiIp.takeUnless { it == "-" } ?: "")
        }

        ApiClient.post(data) { success, message, response ->
            runOnUiThread {
                btnSubmit.text = "Mark My Attendance"

                if (success) {
                    val alreadySaved = response?.optJSONObject("data")
                        ?.optInt("alreadySavedCount", 0) ?: 0
                    tvSuccess.text = if (alreadySaved > 0) {
                        message.ifEmpty { "Attendance is already marked for today." }
                    } else if (attendanceRule.isCompOffEligibleDay) {
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
        tvWifiStatus.text = "Office WiFi verified · ${matchedOffice?.name ?: "Approved Office"}"
        btnSubmit.isEnabled = true
        tvWifiStatus.text = "✅ Office WiFi Verified"
        tvWifiStatus.text = "Office WiFi verified - ${matchedOffice?.name ?: "Approved Office"}"
        tvWifiStatus.setBackgroundResource(R.drawable.status_green)
        tvWifiStatus.setTextColor(ContextCompat.getColor(this, android.R.color.black))
    }

    private fun setWifiNotVerifiedUi(message: String) {
        btnSubmit.isEnabled = false
        tvWifiStatus.text = message
        tvWifiStatus.setBackgroundResource(R.drawable.status_red)
        tvWifiStatus.setTextColor(ContextCompat.getColor(this, android.R.color.black))
    }

    private fun showError(message: String) {
        tvError.text = "❌ $message"
        tvError.setTextColor(ContextCompat.getColor(this, android.R.color.black))
        tvError.visibility = View.VISIBLE
        AppToast.error(this, message)
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

        if (requestCode == 101 && hasLocationPermission()) {
            updateWifiDetails()
        } else {
            setWifiNotVerifiedUi("❌ Location Permission Denied")
            showError("Location and Nearby Wi-Fi permissions are required to verify office Wi-Fi.")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
    }
}
