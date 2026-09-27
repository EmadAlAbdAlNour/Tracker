package com.tracker.driver.tracking

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class TrackerLocationUploader(
    private val context: Context,
    private val store: TrackerLocationStore
) {

    companion object {
        private const val TAG = "TrackerLocationUploader"
        private const val CONNECT_TIMEOUT_MS = 10_000
        private const val READ_TIMEOUT_MS = 10_000
        const val MAX_BATCH_SIZE = 20
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val isUploading = AtomicBoolean(false)

    @Volatile
    var apiBaseUrl: String = "https://tracker-alpha-puce.vercel.app"

    @Volatile
    var telemetryToken: String? = null

    @Volatile
    var deviceId: String? = null

    @Volatile
    var shiftId: String? = null

    interface UploadListener {
        fun onTokenExpired()
        fun onUploadSuccess(accepted: Int, duplicates: Int, remainingQueue: Int)
        fun onUploadError(statusCode: Int, message: String)
    }

    var listener: UploadListener? = null

    /**
     * Non-blocking trigger: asynchronously runs an upload cycle if not already running.
     * Guarantees that if pending points exist when the worker completes, another cycle will run.
     */
    fun triggerUpload() {
        if (isUploading.compareAndSet(false, true)) {
            executor.submit {
                try {
                    processPendingQueue()
                } finally {
                    isUploading.set(false)
                    // Invariant: if points arrived while the batch was uploading, schedule the next batch
                    if (store.getPendingBatch(limit = 1).isNotEmpty()) {
                        triggerUpload()
                    }
                }
            }
        }
    }

    /**
     * Drains queue synchronously up to timeoutMs (used on shift end).
     * Returns true if queue drained to 0.
     */
    fun drainQueue(timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val pendingCount = store.getQueueSize()
            if (pendingCount == 0) {
                return true
            }
            val uploadOk = uploadSingleBatch()
            if (!uploadOk) {
                // If an upload attempt fails (e.g. network down), wait briefly then retry or break
                try {
                    Thread.sleep(500)
                } catch (ignored: InterruptedException) {
                    break
                }
            }
        }
        return store.getQueueSize() == 0
    }

    /**
     * Continuously processes batches as long as points are available and uploading succeeds.
     */
    private fun processPendingQueue() {
        var keepGoing = true
        while (keepGoing) {
            val batch = store.getPendingBatch(limit = MAX_BATCH_SIZE, forShiftId = shiftId)
            if (batch.isEmpty()) {
                break
            }
            val success = sendBatch(batch)
            keepGoing = success && store.getPendingBatch(limit = 1, forShiftId = shiftId).isNotEmpty()
        }
    }

    private fun uploadSingleBatch(): Boolean {
        val batch = store.getPendingBatch(limit = MAX_BATCH_SIZE, forShiftId = shiftId)
        if (batch.isEmpty()) return true
        return sendBatch(batch)
    }

    private fun sendBatch(batch: List<LocationPointRecord>): Boolean {
        val token = telemetryToken
        if (token.isNullOrBlank()) {
            Log.w(TAG, "TRACKER_LOCATION_UPLOAD_FAILURE: Missing telemetry token, skipping upload")
            return false
        }

        val urlString = "${apiBaseUrl.trimEnd('/')}/api/drivers/me/location/batch"
        val batchIds = batch.map { it.clientLocationId }

        Log.d(TAG, "TRACKER_UPLOAD_STARTED batchSize=${batch.size} shiftId=${shiftId?.takeLast(8)} queueSize=${store.getQueueSize(forShiftId = shiftId)}")

        var connection: HttpURLConnection? = null
        try {
            val url = URL(urlString)
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                doInput = true
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Authorization", "Bearer $token")
                deviceId?.let { setRequestProperty("x-device-id", it) }
            }

            val payloadJson = buildBatchPayload(batch)
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(payloadJson.toString())
                writer.flush()
            }

            val responseCode = connection.responseCode
            val responseBody = readResponse(connection, responseCode)

            if (responseCode in 200..201) {
                val json = JSONObject(responseBody)
                val acceptedIds = json.optJSONArray("acceptedClientIds")?.toStringList() ?: emptyList()
                val duplicateIds = json.optJSONArray("duplicateClientIds")?.toStringList() ?: emptyList()
                val confirmedIds = (acceptedIds + duplicateIds).distinct()

                // Delete ONLY confirmed accepted / duplicate records
                if (confirmedIds.isNotEmpty()) {
                    store.deleteConfirmed(confirmedIds)
                } else {
                    // Fallback if response didn't specify IDs but returned 200/201
                    store.deleteConfirmed(batchIds)
                }

                val remaining = store.getQueueSize(forShiftId = shiftId)
                val acceptedCount = json.optInt("accepted", batch.size)
                val dupCount = json.optInt("duplicates", 0)

                Log.d(TAG, "TRACKER_UPLOAD_SUCCESS accepted=$acceptedCount duplicates=$dupCount remainingQueue=$remaining shiftId=${shiftId?.takeLast(8)}")
                listener?.onUploadSuccess(acceptedCount, dupCount, remaining)
                return true
            } else {
                Log.w(TAG, "TRACKER_UPLOAD_FAILURE statusCode=$responseCode message=${responseBody.take(100)} shiftId=${shiftId?.takeLast(8)}")
                listener?.onUploadError(responseCode, responseBody)

                when (responseCode) {
                    401 -> {
                        // Telemetry token expired or invalid: retain queue, apply backoff, notify token refresh
                        store.markFailedAttempts(batchIds)
                        listener?.onTokenExpired()
                        return false
                    }
                    403 -> {
                        // DEVICE_UNAUTHORIZED or account inactive: retain queue, apply backoff
                        store.markFailedAttempts(batchIds)
                        return false
                    }
                    409 -> {
                        // SHIFT_NOT_ACTIVE: server rejected batch because shift ended or token shift mismatch.
                        // NEVER discard points; retain in queue with backoff
                        store.markFailedAttempts(batchIds)
                        return false
                    }
                    429 -> {
                        // Rate limited: retain queue and back off
                        store.markFailedAttempts(batchIds)
                        return false
                    }
                    else -> {
                        // 400 validation error, 5xx server errors, or other: retain and apply backoff
                        store.markFailedAttempts(batchIds)
                        return false
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "TRACKER_UPLOAD_FAILURE statusCode=-1 message=${e.message} shiftId=${shiftId?.takeLast(8)}")
            store.markFailedAttempts(batchIds)
            listener?.onUploadError(-1, e.message ?: "Network error")
            return false
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Triggers an asynchronous, non-blocking heartbeat request.
     * Does NOT alter the durable location queue, does not insert location points.
     */
    fun triggerHeartbeat(
        batteryPercentage: Int? = null,
        isCharging: Boolean? = null,
        locationServicesEnabled: Boolean? = null,
        networkStatus: String? = null
    ) {
        executor.submit {
            try {
                sendHeartbeat(batteryPercentage, isCharging, locationServicesEnabled, networkStatus)
            } catch (e: Exception) {
                Log.w(TAG, "TRACKER_HEARTBEAT_EXCEPTION: ${e.message}")
            }
        }
    }

    /**
     * Sends an independent device heartbeat to POST /api/drivers/me/heartbeat.
     * Updates devices.lastSeen without creating or modifying location points.
     */
    fun sendHeartbeat(
        batteryPercentage: Int? = null,
        isCharging: Boolean? = null,
        locationServicesEnabled: Boolean? = null,
        networkStatus: String? = null
    ): Boolean {
        val token = telemetryToken
        if (token.isNullOrBlank()) {
            Log.w(TAG, "TRACKER_HEARTBEAT_SKIPPED: telemetryToken is null or empty")
            return false
        }

        var connection: HttpURLConnection? = null
        try {
            val url = URL("$apiBaseUrl/api/drivers/me/heartbeat")
            connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
                deviceId?.let { setRequestProperty("x-device-id", it) }
            }

            val body = JSONObject().apply {
                if (shiftId != null) put("shiftId", shiftId)
                if (batteryPercentage != null) put("batteryPercentage", batteryPercentage)
                if (isCharging != null) put("isCharging", isCharging)
                if (locationServicesEnabled != null) put("locationServicesEnabled", locationServicesEnabled)
                if (networkStatus != null) put("networkStatus", networkStatus)
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(body.toString())
                writer.flush()
            }

            val responseCode = connection.responseCode
            val responseBody = readResponse(connection, responseCode)

            if (responseCode in 200..299) {
                Log.d(TAG, "TRACKER_HEARTBEAT_SUCCESS statusCode=$responseCode shiftId=${shiftId?.takeLast(8)}")
                return true
            } else {
                Log.w(TAG, "TRACKER_HEARTBEAT_FAILURE statusCode=$responseCode message=${responseBody.take(100)}")
                if (responseCode == 401) {
                    listener?.onTokenExpired()
                }
                return false
            }
        } catch (e: Exception) {
            Log.w(TAG, "TRACKER_HEARTBEAT_FAILURE network error=${e.message}")
            return false
        } finally {
            connection?.disconnect()
        }
    }

    private fun buildBatchPayload(batch: List<LocationPointRecord>): JSONArray {
        val array = JSONArray()
        for (item in batch) {
            val obj = JSONObject().apply {
                put("clientLocationId", item.clientLocationId)
                if (item.shiftId != null) put("shiftId", item.shiftId)
                put("latitude", item.latitude)
                put("longitude", item.longitude)
                if (item.accuracy != null) put("accuracy", item.accuracy)
                if (item.altitude != null) put("altitude", item.altitude)
                if (item.speed != null) put("speed", item.speed)
                if (item.heading != null) put("heading", item.heading)
                put("recordedAt", item.recordedAt)
                put("source", item.source)
                if (item.batteryPercentage != null) put("batteryPercentage", item.batteryPercentage)
                if (item.isCharging != null) put("isCharging", item.isCharging)
                if (item.locationServicesEnabled != null) put("locationServicesEnabled", item.locationServicesEnabled)
                if (item.networkStatus != null) put("networkStatus", item.networkStatus)
            }
            array.put(obj)
        }
        return array
    }

    private fun readResponse(connection: HttpURLConnection, responseCode: Int): String {
        val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            ?: return ""
        return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
    }

    private fun JSONArray.toStringList(): List<String> {
        val list = mutableListOf<String>()
        for (i in 0 until length()) {
            val item = optString(i, null)
            if (!item.isNullOrBlank()) {
                list.add(item)
            }
        }
        return list
    }
}
