package com.akash.globaloneapp
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.text.format.Formatter
import java.net.Inet4Address
import java.util.Locale
data class WifiNetworkSnapshot(val connected:Boolean,val ssid:String,val bssid:String,val privateIp:String,val ipPrefix:String)
object WifiNetworkReader{
 @Suppress("DEPRECATION") fun read(context:Context):WifiNetworkSnapshot{val connectivity=context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager;val network=connectivity.activeNetwork;val capabilities=connectivity.getNetworkCapabilities(network);if(capabilities==null||!capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return WifiNetworkSnapshot(false,"","","","");val manager=context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager;val legacy=manager.connectionInfo;val modern=if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S)capabilities.transportInfo as? WifiInfo else null;val ssid=listOf(modern?.ssid,legacy.ssid).map(::cleanSsid).firstOrNull(::validSsid).orEmpty();val bssid=listOf(modern?.bssid,legacy.bssid).map(::cleanBssid).firstOrNull(::validBssid).orEmpty();val linkIp=connectivity.getLinkProperties(network)?.linkAddresses?.firstOrNull{it.address is Inet4Address}?.address?.hostAddress.orEmpty();val legacyIp=Formatter.formatIpAddress(legacy.ipAddress).orEmpty();val privateIp=linkIp.ifBlank{legacyIp}.takeIf{it.matches(Regex("^\\d{1,3}(\\.\\d{1,3}){3}$"))}.orEmpty();val prefix=privateIp.substringBeforeLast('.',"").let{if(it.isBlank())"" else "$it."};return WifiNetworkSnapshot(true,ssid,bssid,privateIp,prefix)}
 private fun cleanSsid(v:String?)=(v?:"").replace("\"","").trim();private fun validSsid(v:String)=v.isNotBlank()&&v.lowercase(Locale.ENGLISH)!in setOf("<unknown ssid>","unknown ssid","0x");private fun cleanBssid(v:String?)=(v?:"").trim().lowercase(Locale.ENGLISH);private fun validBssid(v:String)=v.matches(Regex("^([0-9a-f]{2}:){5}[0-9a-f]{2}$"))&&v!="02:00:00:00:00:00"&&v!="00:00:00:00:00:00"
}
