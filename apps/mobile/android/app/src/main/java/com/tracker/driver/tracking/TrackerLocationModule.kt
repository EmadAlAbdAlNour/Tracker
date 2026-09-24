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
}
