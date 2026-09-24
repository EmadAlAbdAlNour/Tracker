package com.tracker.driver.tracking

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.util.concurrent.Executors

class TrackerLocationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "TrackerLocationModule"
        private const val TAG = "TrackerLocationModule"
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val store: TrackerLocationStore by lazy {
        TrackerLocationStore.getInstance(reactContext)
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun startTracking(options: ReadableMap, promise: Promise) {
        try {
            val apiUrl = if (options.hasKey("apiUrl")) options.getString("apiUrl") else "https://tracker-alpha-puce.vercel.app"
            val telemetryToken = if (options.hasKey("telemetryToken")) options.getString("telemetryToken") else null
            val shiftId = if (options.hasKey("shiftId")) options.getString("shiftId") else null
            val deviceId = if (options.hasKey("deviceId")) options.getString("deviceId") else null

            Log.i(TAG, "startTracking requested for shiftId=$shiftId")

            val intent = Intent(reactContext, TrackerLocationService::class.java).apply {
                action = TrackerLocationService.ACTION_START
                putExtra(TrackerLocationService.EXTRA_API_URL, apiUrl)
                putExtra(TrackerLocationService.EXTRA_TELEMETRY_TOKEN, telemetryToken)
                putExtra(TrackerLocationService.EXTRA_SHIFT_ID, shiftId)
                putExtra(TrackerLocationService.EXTRA_DEVICE_ID, deviceId)
            }

            ContextCompat.startForegroundService(reactContext, intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start tracking service", e)
            promise.reject("START_TRACKING_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopTracking(options: ReadableMap?, promise: Promise) {
        executor.submit {
            try {
                Log.i(TAG, "stopTracking requested. Performing final bounded drain...")
                val timeoutMs = if (options != null && options.hasKey("timeoutMs")) {
                    options.getInt("timeoutMs").toLong()
                } else {
                    8000L
                }

                val service = TrackerLocationService.activeService
                val drained = if (service != null) {
                    service.stopLocationUpdates()
                    val result = service.drainQueue(timeoutMs)
                    service.stopForegroundAndSelf()
                    result
                } else {
                    val intent = Intent(reactContext, TrackerLocationService::class.java).apply {
                        action = TrackerLocationService.ACTION_STOP
                    }
                    reactContext.startService(intent)
                    true
                }

                val remaining = store.getQueueSize()
                val result = Arguments.createMap().apply {
                    putBoolean("drained", drained)
                    putInt("remainingCount", remaining)
                }
                Log.i(TAG, "stopTracking completed. Drained=$drained remaining=$remaining")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop tracking service", e)
                promise.reject("STOP_TRACKING_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun updateTelemetryToken(token: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, TrackerLocationService::class.java).apply {
                action = TrackerLocationService.ACTION_UPDATE_TOKEN
                putExtra(TrackerLocationService.EXTRA_TELEMETRY_TOKEN, token)
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update telemetry token", e)
            promise.reject("UPDATE_TOKEN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getTrackingStatus(promise: Promise) {
        try {
            val isRunning = TrackerLocationService.isServiceRunning
            val queueSize = store.getQueueSize()
            val result = Arguments.createMap().apply {
                putBoolean("isTracking", isRunning)
                putInt("queueSize", queueSize)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_STATUS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getQueueSize(promise: Promise) {
        try {
            promise.resolve(store.getQueueSize())
        } catch (e: Exception) {
            promise.reject("GET_QUEUE_SIZE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getCurrentLocation(options: ReadableMap?, promise: Promise) {
        val fineGranted = ContextCompat.checkSelfPermission(
            reactContext,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

        if (!fineGranted) {
            promise.reject("PERMISSION_DENIED", "ACCESS_FINE_LOCATION permission is required to acquire current location")
            return
        }

        try {
            val timeoutMs = if (options != null && options.hasKey("timeoutMs")) options.getInt("timeoutMs").toLong() else 10000L
            val fusedClient = LocationServices.getFusedLocationProviderClient(reactContext)
            val cts = CancellationTokenSource()

            val mainHandler = Handler(Looper.getMainLooper())
            var isSettled = false

            val timeoutRunnable = Runnable {
                if (!isSettled) {
                    isSettled = true
                    cts.cancel()
                    promise.reject("TIMEOUT", "Location request timed out after ${timeoutMs}ms")
                }
            }
            mainHandler.postDelayed(timeoutRunnable, timeoutMs)

            fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { location: Location? ->
                    mainHandler.removeCallbacks(timeoutRunnable)
                    if (!isSettled) {
                        isSettled = true
                        if (location != null) {
                            val ageMs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                                (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000
                            } else {
                                System.currentTimeMillis() - location.time
                            }
                            val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else 999.0
                            val result = Arguments.createMap().apply {
                                putDouble("latitude", location.latitude)
                                putDouble("longitude", location.longitude)
                                putDouble("accuracy", accuracy)
                                putDouble("ageMs", ageMs.toDouble())
                                putDouble("timestamp", location.time.toDouble())
                            }
                            Log.i(TAG, "getCurrentLocation success lat=${location.latitude} lng=${location.longitude} acc=${accuracy}m age=${ageMs}ms")
                            promise.resolve(result)
                        } else {
                            promise.reject("LOCATION_UNAVAILABLE", "Current location fix unavailable")
                        }
                    }
                }
                .addOnFailureListener { e ->
                    mainHandler.removeCallbacks(timeoutRunnable)
                    if (!isSettled) {
                        isSettled = true
                        Log.w(TAG, "getCurrentLocation failure: ${e.message}")
                        promise.reject("LOCATION_ERROR", e.message, e)
                    }
                }
        } catch (e: Exception) {
            promise.reject("LOCATION_ERROR", e.message, e)
        }
    }
}
