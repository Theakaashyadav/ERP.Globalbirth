package com.akash.globaloneapp

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.text.format.Formatter
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.util.Locale

class SetOfficeWifiActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout
    private lateinit var officeName: android.widget.EditText
    private lateinit var networkCard: LinearLayout
    private lateinit var submitButton: android.widget.Button
    private var ssid=""; private var bssid=""; private var privateIp=""; private var ipPrefix=""
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if(!SessionManager(this).hasMobileFeature("officeWifi")){EmployeeUi.toast(this,"Set Office WiFi is not enabled for your role.");finish();return}; root=EmployeeUi.screen(this,"Set Office Wi-Fi","Submit this office network for admin approval","officeWifi",true); render(); loadSubmissions(); if(hasWifiPermissions())readCurrentWifi() else requestWifiPermissions() }
    override fun onResume(){super.onResume();val session=SessionManager(this);ApiClient.post(JSONObject().put("action","getEmployeeMobileFeatures").put("employeeId",session.getEmployeeId())){ok,_,response->val features=response?.optJSONObject("data")?.optJSONArray("features");val allowed=ok&&features!=null&&(0 until features.length()).any{features.optString(it)=="officeWifi"};if(!allowed)runOnUiThread{session.saveMobileFeatures(session.getMobileFeatures()-"officeWifi");EmployeeUi.toast(this,"Set Office WiFi is disabled by admin.");finish()}}}
    private fun render(){ EmployeeUi.addCard(root,EmployeeUi.card(this,"How approval works","Connect to the office Wi-Fi, enter the office name and submit. Attendance remains blocked until an administrator approves it.","#0891B2")); officeName=EmployeeUi.input(this,"Office name, e.g. Noida Office");root.addView(officeName,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(14)});networkCard=EmployeeUi.card(this,"Current Wi-Fi","Reading the connected network...","#7C3AED");EmployeeUi.addCard(root,networkCard);submitButton=EmployeeUi.button(this,"Submit Wi-Fi for Admin Approval","#059669"){submit()}.apply{isEnabled=false};root.addView(submitButton,LinearLayout.LayoutParams(-1,dp(54)).apply{bottomMargin=dp(20)});root.addView(EmployeeUi.section(this,"MY SUBMISSIONS")) }
    private fun readCurrentWifi(){if(!hasWifiPermissions())return;val location=getSystemService(Context.LOCATION_SERVICE) as LocationManager;if(!location.isProviderEnabled(LocationManager.GPS_PROVIDER)&&!location.isProviderEnabled(LocationManager.NETWORK_PROVIDER)){showNetwork("Turn on phone Location/GPS to read Wi-Fi details.",false);return};val snapshot=WifiNetworkReader.read(this);if(!snapshot.connected){showNetwork("Connect to the office Wi-Fi first.",false);return};ssid=snapshot.ssid;bssid=snapshot.bssid;privateIp=snapshot.privateIp;ipPrefix=snapshot.ipPrefix;val usable=ssid.isNotBlank()&&bssid.isNotBlank()&&privateIp.isNotBlank();showNetwork(if(usable)"Wi-Fi name (SSID): $ssid\nRouter BSSID: $bssid\nPrivate IPv4: $privateIp\nNetwork range: $ipPrefix\n\nThese exact details will be submitted for approval." else "Some Wi-Fi details are hidden. Allow Nearby Wi-Fi and Location permissions, turn on Location/GPS, then reopen this page.",usable)}
    private fun showNetwork(body:String,usable:Boolean){(networkCard.getChildAt(0) as? TextView)?.text=if(usable)"Connected Wi-Fi detected" else "Wi-Fi not ready";(networkCard.getChildAt(1) as? TextView)?.apply{text=body;setTextColor(Color.parseColor(if(usable)"#475569" else "#DC2626"))};submitButton.isEnabled=usable}
    private fun submit(){val name=officeName.text.toString().trim();if(name.isBlank()){officeName.error="Office name is required";return};submitButton.isEnabled=false;submitButton.text="Submitting...";val session=SessionManager(this);val data=JSONObject().put("action","submitOfficeWifi").put("employeeId",session.getEmployeeId()).put("name",name).put("ssid",ssid).put("bssid",bssid).put("privateIp",privateIp).put("ipPrefix",ipPrefix);ApiClient.post(data){ok,message,_->runOnUiThread{submitButton.text="Submit Wi-Fi for Admin Approval";submitButton.isEnabled=true;EmployeeUi.toast(this,message.ifBlank{if(ok)"Wi-Fi submitted for approval." else "Submission failed."});if(ok){officeName.text.clear();loadSubmissions()}}}}
    private fun loadSubmissions(){val session=SessionManager(this);ApiClient.post(JSONObject().put("action","getEmployeeWifiSubmissions").put("employeeId",session.getEmployeeId())){ok,_,response->runOnUiThread{if(!ok)return@runOnUiThread;root.findViewWithTag<LinearLayout>("wifi_submission_list")?.let(root::removeView);val list=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;tag="wifi_submission_list"};val offices=response?.optJSONObject("data")?.optJSONArray("offices");if(offices==null||offices.length()==0)EmployeeUi.addCard(list,EmployeeUi.card(this,"No submissions yet","Your submitted Wi-Fi networks and approval status will appear here.","#64748B"))else for(index in 0 until offices.length()){val item=offices.optJSONObject(index)?:continue;val active=item.optBoolean("active");val status=if(active)"APPROVED & ACTIVE" else item.optString("status","pending").uppercase();EmployeeUi.addCard(list,EmployeeUi.card(this,item.optString("name"),"$status\nSSID: ${item.optString("ssid").ifBlank{"Unavailable"}}\nBSSID: ${item.optString("bssid").ifBlank{"Unavailable"}}\nPrivate IP: ${item.optString("privateIp").ifBlank{"Unavailable"}}\nIP range: ${item.optString("ipPrefix").ifBlank{"Unavailable"}}",if(active)"#059669" else "#D97706"))};root.addView(list)}}}
    private fun hasWifiPermissions()=ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED&&(Build.VERSION.SDK_INT<Build.VERSION_CODES.TIRAMISU||ContextCompat.checkSelfPermission(this,Manifest.permission.NEARBY_WIFI_DEVICES)==PackageManager.PERMISSION_GRANTED);private fun requestWifiPermissions(){val p=mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION);if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.TIRAMISU)p+=Manifest.permission.NEARBY_WIFI_DEVICES;ActivityCompat.requestPermissions(this,p.toTypedArray(),601)};override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==601&&hasWifiPermissions())readCurrentWifi()else showNetwork("Nearby Wi-Fi and Location permissions are required to read all details.",false)};private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
}
