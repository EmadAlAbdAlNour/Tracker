package com.tracker.driver.tracking

data class LocationPointRecord(
    val id: Long = 0,
    val clientLocationId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double? = null,
    val altitude: Double? = null,
    val speed: Double? = null,
    val heading: Double? = null,
    val recordedAt: String,
    val batteryPercentage: Int? = null,
    val isCharging: Boolean? = null,
    val locationServicesEnabled: Boolean? = null,
    val networkStatus: String? = null,
    val source: String = "mobile",
    val createdAt: Long = System.currentTimeMillis(),
    val attemptCount: Int = 0,
    val nextRetryAt: Long = 0
)
