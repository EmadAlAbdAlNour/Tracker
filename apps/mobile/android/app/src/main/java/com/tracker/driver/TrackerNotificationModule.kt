package com.tracker.driver

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class TrackerNotificationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "TrackerNotificationModule"
        var pendingNotificationAction: WritableMap? = null
        var instance: TrackerNotificationModule? = null
    }

    init {
        instance = this
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun checkPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            promise.resolve(granted)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val activity = currentActivity
            if (activity != null) {
                ActivityCompat.requestPermissions(
                    activity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    1001
                )
                val granted = ContextCompat.checkSelfPermission(
                    activity,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                promise.resolve(granted)
            } else {
                promise.resolve(false)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun showNotification(
        notificationId: Int,
        channelId: String,
        title: String,
        body: String,
        data: ReadableMap?,
        promise: Promise
    ) {
        try {
            val context = reactApplicationContext
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("action", "OPEN_NOTIFICATIONS")
                if (data != null && data.hasKey("notificationId")) {
                    putExtra("notificationId", data.getString("notificationId"))
                }
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val selectedChannel = if (channelId.isNotBlank()) channelId else "tracker_alerts_channel"

            val builder = NotificationCompat.Builder(context, selectedChannel)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setContentIntent(pendingIntent)

            notificationManager.notify(notificationId, builder.build())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getInitialNotification(promise: Promise) {
        val pending = pendingNotificationAction
        pendingNotificationAction = null
        promise.resolve(pending)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep for RN NativeEventEmitter
    }

    fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun installApk(filePath: String, promise: Promise) {
        try {
            val context = currentActivity ?: reactApplicationContext
            val cleanPath = filePath.removePrefix("file://")
            val file = java.io.File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file does not exist at path: $filePath")
                return
            }

            val apkUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file
                )
            } else {
                android.net.Uri.fromFile(file)
            }

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    val settingsIntent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = android.net.Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(settingsIntent)
                }
            }

            context.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getFileSha256(filePath: String, promise: Promise) {
        try {
            val cleanPath = filePath.removePrefix("file://")
            val file = java.io.File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File does not exist: $filePath")
                return
            }

            val digest = java.security.MessageDigest.getInstance("SHA-256")
            file.inputStream().use { stream ->
                val buffer = ByteArray(16384)
                var bytesRead: Int
                while (stream.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }
            val hash = digest.digest().joinToString("") { "%02x".format(it) }
            promise.resolve(hash)
        } catch (e: Exception) {
            promise.reject("HASH_ERROR", e.message, e)
        }
    }
}

