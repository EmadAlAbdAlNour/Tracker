package com.tracker.driver.tracking

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log

class TrackerLocationStore(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val TAG = "TrackerLocationStore"
        private const val DATABASE_NAME = "tracker_telemetry_queue.db"
        private const val DATABASE_VERSION = 1
        private const val TABLE_QUEUE = "location_queue"
        const val MAX_QUEUE_SIZE = 1000

        // Column names
        private const val COL_ID = "id"
        private const val COL_CLIENT_LOCATION_ID = "client_location_id"
        private const val COL_LATITUDE = "latitude"
        private const val COL_LONGITUDE = "longitude"
        private const val COL_ACCURACY = "accuracy"
        private const val COL_ALTITUDE = "altitude"
        private const val COL_SPEED = "speed"
        private const val COL_HEADING = "heading"
        private const val COL_RECORDED_AT = "recorded_at"
        private const val COL_BATTERY_PERCENTAGE = "battery_percentage"
        private const val COL_IS_CHARGING = "is_charging"
        private const val COL_LOCATION_SERVICES_ENABLED = "location_services_enabled"
        private const val COL_NETWORK_STATUS = "network_status"
        private const val COL_SOURCE = "source"
        private const val COL_CREATED_AT = "created_at"
        private const val COL_ATTEMPT_COUNT = "attempt_count"
        private const val COL_NEXT_RETRY_AT = "next_retry_at"

        @Volatile
        private var instance: TrackerLocationStore? = null

        fun getInstance(context: Context): TrackerLocationStore {
            return instance ?: synchronized(this) {
                instance ?: TrackerLocationStore(context.applicationContext).also { instance = it }
            }
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createSql = """
            CREATE TABLE $TABLE_QUEUE (
                $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_CLIENT_LOCATION_ID TEXT UNIQUE NOT NULL,
                $COL_LATITUDE REAL NOT NULL,
                $COL_LONGITUDE REAL NOT NULL,
                $COL_ACCURACY REAL,
                $COL_ALTITUDE REAL,
                $COL_SPEED REAL,
                $COL_HEADING REAL,
                $COL_RECORDED_AT TEXT NOT NULL,
                $COL_BATTERY_PERCENTAGE INTEGER,
                $COL_IS_CHARGING INTEGER,
                $COL_LOCATION_SERVICES_ENABLED INTEGER,
                $COL_NETWORK_STATUS TEXT,
                $COL_SOURCE TEXT NOT NULL DEFAULT 'mobile',
                $COL_CREATED_AT INTEGER NOT NULL,
                $COL_ATTEMPT_COUNT INTEGER NOT NULL DEFAULT 0,
                $COL_NEXT_RETRY_AT INTEGER NOT NULL DEFAULT 0
            );
        """.trimIndent()
        db.execSQL(createSql)

        val indexSql = """
            CREATE INDEX IF NOT EXISTS idx_location_queue_retry 
            ON $TABLE_QUEUE ($COL_NEXT_RETRY_AT, $COL_ID);
        """.trimIndent()
        db.execSQL(indexSql)
        Log.i(TAG, "Initialized SQLite queue database: $DATABASE_NAME")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_QUEUE")
        onCreate(db)
    }

    @Synchronized
    fun enqueue(point: LocationPointRecord): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            put(COL_CLIENT_LOCATION_ID, point.clientLocationId)
            put(COL_LATITUDE, point.latitude)
            put(COL_LONGITUDE, point.longitude)
            if (point.accuracy != null) put(COL_ACCURACY, point.accuracy) else putNull(COL_ACCURACY)
            if (point.altitude != null) put(COL_ALTITUDE, point.altitude) else putNull(COL_ALTITUDE)
            if (point.speed != null) put(COL_SPEED, point.speed) else putNull(COL_SPEED)
            if (point.heading != null) put(COL_HEADING, point.heading) else putNull(COL_HEADING)
            put(COL_RECORDED_AT, point.recordedAt)
            if (point.batteryPercentage != null) put(COL_BATTERY_PERCENTAGE, point.batteryPercentage) else putNull(COL_BATTERY_PERCENTAGE)
            if (point.isCharging != null) put(COL_IS_CHARGING, if (point.isCharging) 1 else 0) else putNull(COL_IS_CHARGING)
            if (point.locationServicesEnabled != null) put(COL_LOCATION_SERVICES_ENABLED, if (point.locationServicesEnabled) 1 else 0) else putNull(COL_LOCATION_SERVICES_ENABLED)
            if (point.networkStatus != null) put(COL_NETWORK_STATUS, point.networkStatus) else putNull(COL_NETWORK_STATUS)
            put(COL_SOURCE, point.source)
            put(COL_CREATED_AT, point.createdAt)
            put(COL_ATTEMPT_COUNT, point.attemptCount)
            put(COL_NEXT_RETRY_AT, point.nextRetryAt)
        }

        val rowId = db.insertWithOnConflict(
            TABLE_QUEUE,
            null,
            values,
            SQLiteDatabase.CONFLICT_IGNORE
        )

        // Enforce maximum queue cap (prune oldest when size > MAX_QUEUE_SIZE)
        pruneIfExceedsCap(db)

        val currentSize = getQueueSizeInternal(db)
        Log.d(TAG, "TRACKER_LOCATION_QUEUE_INSERT id=$rowId clientId=${point.clientLocationId} queueSize=$currentSize")
        return rowId
    }

    private fun pruneIfExceedsCap(db: SQLiteDatabase) {
        val count = getQueueSizeInternal(db)
        if (count > MAX_QUEUE_SIZE) {
            val toDelete = count - MAX_QUEUE_SIZE
            val pruneSql = """
                DELETE FROM $TABLE_QUEUE WHERE $COL_ID IN (
                    SELECT $COL_ID FROM $TABLE_QUEUE ORDER BY $COL_ID ASC LIMIT $toDelete
                )
            """.trimIndent()
            db.execSQL(pruneSql)
            Log.w(TAG, "Queue cap exceeded ($count > $MAX_QUEUE_SIZE). Pruned $toDelete oldest records.")
        }
    }

    @Synchronized
    fun getPendingBatch(limit: Int = 20, nowMs: Long = System.currentTimeMillis()): List<LocationPointRecord> {
        val db = readableDatabase
        val result = mutableListOf<LocationPointRecord>()
        val selection = "$COL_NEXT_RETRY_AT <= ?"
        val selectionArgs = arrayOf(nowMs.toString())
        val orderBy = "$COL_ID ASC"

        val cursor = db.query(
            TABLE_QUEUE,
            null,
            selection,
            selectionArgs,
            null,
            null,
            orderBy,
            limit.toString()
        )

        cursor.use {
            while (it.moveToNext()) {
                val point = LocationPointRecord(
                    id = it.getLong(it.getColumnIndexOrThrow(COL_ID)),
                    clientLocationId = it.getString(it.getColumnIndexOrThrow(COL_CLIENT_LOCATION_ID)),
                    latitude = it.getDouble(it.getColumnIndexOrThrow(COL_LATITUDE)),
                    longitude = it.getDouble(it.getColumnIndexOrThrow(COL_LONGITUDE)),
                    accuracy = if (it.isNull(it.getColumnIndexOrThrow(COL_ACCURACY))) null else it.getDouble(it.getColumnIndexOrThrow(COL_ACCURACY)),
                    altitude = if (it.isNull(it.getColumnIndexOrThrow(COL_ALTITUDE))) null else it.getDouble(it.getColumnIndexOrThrow(COL_ALTITUDE)),
                    speed = if (it.isNull(it.getColumnIndexOrThrow(COL_SPEED))) null else it.getDouble(it.getColumnIndexOrThrow(COL_SPEED)),
                    heading = if (it.isNull(it.getColumnIndexOrThrow(COL_HEADING))) null else it.getDouble(it.getColumnIndexOrThrow(COL_HEADING)),
                    recordedAt = it.getString(it.getColumnIndexOrThrow(COL_RECORDED_AT)),
                    batteryPercentage = if (it.isNull(it.getColumnIndexOrThrow(COL_BATTERY_PERCENTAGE))) null else it.getInt(it.getColumnIndexOrThrow(COL_BATTERY_PERCENTAGE)),
                    isCharging = if (it.isNull(it.getColumnIndexOrThrow(COL_IS_CHARGING))) null else it.getInt(it.getColumnIndexOrThrow(COL_IS_CHARGING)) == 1,
                    locationServicesEnabled = if (it.isNull(it.getColumnIndexOrThrow(COL_LOCATION_SERVICES_ENABLED))) null else it.getInt(it.getColumnIndexOrThrow(COL_LOCATION_SERVICES_ENABLED)) == 1,
                    networkStatus = if (it.isNull(it.getColumnIndexOrThrow(COL_NETWORK_STATUS))) null else it.getString(it.getColumnIndexOrThrow(COL_NETWORK_STATUS)),
                    source = it.getString(it.getColumnIndexOrThrow(COL_SOURCE)),
                    createdAt = it.getLong(it.getColumnIndexOrThrow(COL_CREATED_AT)),
                    attemptCount = it.getInt(it.getColumnIndexOrThrow(COL_ATTEMPT_COUNT)),
                    nextRetryAt = it.getLong(it.getColumnIndexOrThrow(COL_NEXT_RETRY_AT))
                )
                result.add(point)
            }
        }
        return result
    }

    @Synchronized
    fun deleteConfirmed(clientLocationIds: List<String>): Int {
        if (clientLocationIds.isEmpty()) return 0
        val db = writableDatabase
        var deletedCount = 0

        // Chunk in groups of 50 for SQLite binding limit safety
        clientLocationIds.chunked(50).forEach { chunk ->
            val placeholders = chunk.joinToString(",") { "?" }
            val deleted = db.delete(
                TABLE_QUEUE,
                "$COL_CLIENT_LOCATION_ID IN ($placeholders)",
                chunk.toTypedArray()
            )
            deletedCount += deleted
        }

        val remaining = getQueueSizeInternal(db)
        Log.d(TAG, "TRACKER_LOCATION_QUEUE_DELETED confirmedCount=$deletedCount remainingQueue=$remaining")
        return deletedCount
    }

    @Synchronized
    fun markFailedAttempts(clientLocationIds: List<String>, nowMs: Long = System.currentTimeMillis()) {
        if (clientLocationIds.isEmpty()) return
        val db = writableDatabase

        clientLocationIds.chunked(50).forEach { chunk ->
            val placeholders = chunk.joinToString(",") { "?" }
            val cursor = db.rawQuery(
                "SELECT $COL_CLIENT_LOCATION_ID, $COL_ATTEMPT_COUNT FROM $TABLE_QUEUE WHERE $COL_CLIENT_LOCATION_ID IN ($placeholders)",
                chunk.toTypedArray()
            )
            val toUpdate = mutableListOf<Pair<String, Int>>()

            cursor.use {
                while (it.moveToNext()) {
                    val clientId = it.getString(0)
                    val attempts = it.getInt(1) + 1
                    toUpdate.add(Pair(clientId, attempts))
                }
            }

            // Apply exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s. NEVER delete failed points.
            for ((clientId, attempts) in toUpdate) {
                val shift = minOf(attempts - 1, 5)
                val backoffMs = minOf(30_000L, 1_000L * (1L shl shift))
                val nextRetry = nowMs + backoffMs
                val values = ContentValues().apply {
                    put(COL_ATTEMPT_COUNT, attempts)
                    put(COL_NEXT_RETRY_AT, nextRetry)
                }
                db.update(TABLE_QUEUE, values, "$COL_CLIENT_LOCATION_ID = ?", arrayOf(clientId))
            }
        }
    }

    @Synchronized
    fun getQueueSize(): Int {
        val db = readableDatabase
        return getQueueSizeInternal(db)
    }

    private fun getQueueSizeInternal(db: SQLiteDatabase): Int {
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_QUEUE", null)
        cursor.use {
            if (it.moveToFirst()) {
                return it.getInt(0)
            }
        }
        return 0
    }

    @Synchronized
    fun clearQueue(): Int {
        val db = writableDatabase
        val deleted = db.delete(TABLE_QUEUE, null, null)
        Log.i(TAG, "Cleared all $deleted points from SQLite queue")
        return deleted
    }
}
