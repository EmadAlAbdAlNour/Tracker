package com.tracker.driver.tracking

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tracker.driver.MainActivity
import com.tracker.driver.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class TrackerLocationService : Service() {

    companion object {
        private const val TAG = "TrackerLocationService"
        const val NOTIFICATION_ID = 9001
        const val CHANNEL_ID = "tracker_tracking_channel"

        const val ACTION_START = "com.tracker.driver.action.START_TRACKING"
        const val ACTION_STOP = "com.tracker.driver.action.STOP_TRACKING"
        const val ACTION_UPDATE_TOKEN = "com.tracker.driver.action.UPDATE_TOKEN"

        const val EXTRA_API_URL = "extra_api_url"
        const val EXTRA_TELEMETRY_TOKEN = "extra_telemetry_token"
        const val EXTRA_SHIFT_ID = "extra_shift_id"
        const val EXTRA_DEVICE_ID = "extra_device_id"

        private const val PREFS_NAME = "tracker_service_state"
        private const val KEY_IS_ACTIVE = "is_active"
        private const val KEY_API_URL = "api_url"
        private const val KEY_TELEMETRY_TOKEN = "telemetry_token"
        private const val KEY_SHIFT_ID = "shift_id"
        private const val KEY_DEVICE_ID = "device_id"

        @Volatile
        var isServiceRunning: Boolean = false
            private set

        @Volatile
        var activeService: TrackerLocationService? = null
            private set
    }

    private lateinit var store: TrackerLocationStore
    private lateinit var uploader: TrackerLocationUploader
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var prefs: SharedPreferences

    @Volatile
    private var isLocationUpdatesActive = false

    private val isoDateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            for (location in result.locations) {
                handleNewLocation(location)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "TRACKER_LOCATION_SERVICE_CREATED")
        activeService = this
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        store = TrackerLocationStore.getInstance(this)
        uploader = TrackerLocationUploader(this, store)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action

        when (action) {
            ACTION_STOP -> {
                Log.i(TAG, "TRACKER_LOCATION_SERVICE_STOP requested")
                stopTrackingInternal()
                return START_NOT_STICKY
            }
            ACTION_UPDATE_TOKEN -> {
                val newToken = intent.getStringExtra(EXTRA_TELEMETRY_TOKEN)
                if (!newToken.isNullOrBlank()) {
                    uploader.telemetryToken = newToken
                    prefs.edit().putString(KEY_TELEMETRY_TOKEN, newToken).apply()
                    Log.i(TAG, "TRACKER_TELEMETRY_TOKEN_UPDATED")
                    uploader.triggerUpload()
                }
                return START_STICKY
            }
            ACTION_START -> {
                val apiUrl = intent.getStringExtra(EXTRA_API_URL) ?: "https://tracker-alpha-puce.vercel.app"
                val token = intent.getStringExtra(EXTRA_TELEMETRY_TOKEN)
                val shiftId = intent.getStringExtra(EXTRA_SHIFT_ID)
                val deviceId = intent.getStringExtra(EXTRA_DEVICE_ID)

                startTrackingInternal(apiUrl, token, shiftId, deviceId)
                return START_STICKY
            }
            else -> {
                // If service was recreated by Android after being killed by OS
                if (intent == null && prefs.getBoolean(KEY_IS_ACTIVE, false)) {
                    val apiUrl = prefs.getString(KEY_API_URL, null) ?: "https://tracker-alpha-puce.vercel.app"
                    val token = prefs.getString(KEY_TELEMETRY_TOKEN, null)
                    val shiftId = prefs.getString(KEY_SHIFT_ID, null)
                    val deviceId = prefs.getString(KEY_DEVICE_ID, null)

                    Log.w(TAG, "TRACKER_LOCATION_SERVICE recreated by OS; restoring shift $shiftId")
                    startTrackingInternal(apiUrl, token, shiftId, deviceId)
                    return START_STICKY
                } else {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
        }
    }

    private fun startTrackingInternal(
        apiUrl: String,
        token: String?,
        shiftId: String?,
        deviceId: String?
    ) {
        uploader.apiBaseUrl = apiUrl
        uploader.telemetryToken = token
        uploader.shiftId = shiftId
        uploader.deviceId = deviceId

        prefs.edit()
            .putBoolean(KEY_IS_ACTIVE, true)
            .putString(KEY_API_URL, apiUrl)
            .putString(KEY_TELEMETRY_TOKEN, token)
            .putString(KEY_SHIFT_ID, shiftId)
            .putString(KEY_DEVICE_ID, deviceId)
            .apply()

        val notification = buildForegroundNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        isServiceRunning = true
        requestLocationUpdates()

        // Trigger any pending points from previous session
        uploader.triggerUpload()
        Log.i(TAG, "TRACKER_LOCATION_SERVICE_STARTED shiftId=$shiftId queueSize=${store.getQueueSize()}")
    }

    fun stopLocationUpdates() {
        if (!isLocationUpdatesActive) return
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
            Log.i(TAG, "FusedLocation updates stopped")
        } catch (e: Exception) {
            Log.w(TAG, "Error removing location updates: ${e.message}")
        } finally {
            isLocationUpdatesActive = false
        }
    }

    fun drainQueue(timeoutMs: Long): Boolean {
        return uploader.drainQueue(timeoutMs)
    }

    fun stopForegroundAndSelf() {
        isServiceRunning = false
        prefs.edit().putBoolean(KEY_IS_ACTIVE, false).apply()
        stopLocationUpdates()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
        Log.i(TAG, "TRACKER_LOCATION_SERVICE_STOPPED")
    }

    private fun stopTrackingInternal() {
        stopLocationUpdates()

        // Bounded drain of any remaining queue points before closing
        try {
            val drained = uploader.drainQueue(timeoutMs = 8000L)
            Log.i(TAG, "Shift stop drain completed. Fully drained: $drained, remaining: ${store.getQueueSize()}")
        } catch (e: Exception) {
            Log.w(TAG, "Error during queue drain: ${e.message}")
        }

        stopForegroundAndSelf()
    }

    private fun requestLocationUpdates() {
        if (isLocationUpdatesActive) {
            Log.d(TAG, "Location updates already active, skipping duplicate registration")
            return
        }

        val locationRequest = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
            .setMinUpdateDistanceMeters(10f)
            .setMinUpdateIntervalMillis(3000L)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
            isLocationUpdatesActive = true
            Log.i(TAG, "FusedLocationProvider updates requested (interval=5000ms, minDistance=10m)")
        } catch (securityEx: SecurityException) {
            Log.e(TAG, "Missing location permissions for FusedLocationProvider", securityEx)
            stopSelf()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request location updates", e)
        }
    }

    private fun handleNewLocation(location: Location) {
        val isoTimestamp = synchronized(isoDateFormat) {
            isoDateFormat.format(Date(location.time))
        }
        val clientLocationId = "${System.currentTimeMillis()}-${UUID.randomUUID().toString().substring(0, 8)}"

        // Sanitize values to strictly conform to backend schema (e.g. accuracy >= 0, speed >= 0, heading 0..360)
        val accuracy = if (location.hasAccuracy() && location.accuracy >= 0f) location.accuracy.toDouble() else null
        val altitude = if (location.hasAltitude()) location.altitude else null
        val speed = if (location.hasSpeed() && location.speed >= 0f) location.speed.toDouble() else null
        val heading = if (location.hasBearing() && location.bearing in 0.0f..360.0f) location.bearing.toDouble() else null

        val point = LocationPointRecord(
            clientLocationId = clientLocationId,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = accuracy,
            altitude = altitude,
            speed = speed,
            heading = heading,
            recordedAt = isoTimestamp,
            batteryPercentage = getBatteryPercentage(),
            isCharging = getIsCharging(),
            locationServicesEnabled = isLocationEnabled(),
            networkStatus = getNetworkStatus()
        )

        store.enqueue(point)
        Log.d(TAG, "TRACKER_LOCATION_UPDATE lat=${point.latitude} lng=${point.longitude} acc=${point.accuracy} time=${point.recordedAt}")

        // Immediately trigger uploader (does not wait for 20 points)
        uploader.triggerUpload()
    }

    private fun buildForegroundNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tracker")
            .setContentText("خدمة تتبع الموقع قيد التشغيل")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun getBatteryPercentage(): Int? {
        return try {
            val batteryIntent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) {
                ((level.toFloat() / scale.toFloat()) * 100).toInt()
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun getIsCharging(): Boolean? {
        return try {
            val batteryIntent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) {
            null
        }
    }

    private fun isLocationEnabled(): Boolean {
        return try {
            val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            lm?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
                lm?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
        } catch (e: Exception) {
            true
        }
    }

    private fun getNetworkStatus(): String {
        return try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return "unknown"
            val network = cm.activeNetwork ?: return "offline"
            val capabilities = cm.getNetworkCapabilities(network) ?: return "offline"

            when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                else -> "online"
            }
        } catch (e: Exception) {
            "unknown"
        }
    }

    override fun onDestroy() {
        Log.i(TAG, "TRACKER_LOCATION_SERVICE_DESTROYED")
        isServiceRunning = false
        if (activeService === this) {
            activeService = null
        }
        stopLocationUpdates()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
