package io.fleetbase.navigator.location

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import com.google.android.gms.location.*
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import io.fleetbase.navigator.MainActivity
import io.fleetbase.navigator.R
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Own Android foreground-location implementation. Tracks only the online
 * driver's in-memory session, never starts at boot, and never restarts itself
 * after force-stop. Android's visible notification accompanies every update. */
class DwcLocationService : Service() {
    private val client by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val worker = Executors.newSingleThreadExecutor()
    private val sending = AtomicBoolean(false)
    private var ownedGeneration = -1L
    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            if (session == null) return
            DwcLocationModule.emit("DwcLocation", DwcLocationModule.locationMap(location))
            upload(location)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (session == null || !DwcLocationModule.hasPermission(this)) {
            clearSession()
            stopSelf()
            return START_NOT_STICKY
        }
        ownedGeneration = generation
        val notifications = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(NotificationChannel("driver-location", "Driver location sharing", NotificationManager.IMPORTANCE_LOW))
        val openApp = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "driver-location") else Notification.Builder(this)
        val notification = builder.setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("FullSend Driver is sharing location")
            .setContentText("Location is shared while you are online. Open the app to go offline.")
            .setContentIntent(openApp).setOngoing(true).build()
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(4101, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            else startForeground(4101, notification)
            client.removeLocationUpdates(callback)
            client.requestLocationUpdates(
                LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15000L)
                    .setMinUpdateIntervalMillis(10000L).setMinUpdateDistanceMeters(10f).build(),
                callback, Looper.getMainLooper()
            ).addOnSuccessListener {
                synchronized(guard) {
                    if (session != null) {
                        isRunning = true
                        pendingStart?.resolve(null)
                        pendingStart = null
                    }
                }
            }.addOnFailureListener {
                DwcLocationModule.locationError("LOCATION_START")
                clearSession()
                stopSelf()
            }
        } catch (_: RuntimeException) {
            DwcLocationModule.locationError("LOCATION_PERMISSION")
            clearSession()
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun upload(location: Location) {
        val current = session ?: return
        val version = generation
        // Never build a backlog of old coordinates. A disconnected device sends
        // its next current fix when connectivity returns; no route-history claim.
        if (!sending.compareAndSet(false, true)) return
        worker.execute {
            var connection: HttpURLConnection? = null
            try {
                synchronized(guard) {
                    if (session !== current || generation != version) return@execute
                    connection = (URL(current.url).openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 15000
                        readTimeout = 15000
                        instanceFollowRedirects = false
                        doOutput = true
                        setRequestProperty("Authorization", current.authorization)
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("Accept", "application/json")
                    }
                    activeConnection = connection
                }
                val body = JSONObject().apply {
                    put("latitude", location.latitude)
                    put("longitude", location.longitude)
                    put("accuracy", location.accuracy)
                    put("heading", location.bearing)
                    put("speed", location.speed)
                    put("altitude", location.altitude)
                    put("timestamp", DwcLocationModule.timestamp(location.time))
                    put("activity", "unknown")
                    put("is_moving", location.hasSpeed() && location.speed > 0.5f)
                }.toString().toByteArray(Charsets.UTF_8)
                connection!!.outputStream.use { it.write(body) }
                val status = connection!!.responseCode
                if (status == 401 || status == 403) {
                    synchronized(guard) {
                        if (generation == version) {
                            clearSession()
                            DwcLocationModule.locationError("LOCATION_SESSION_EXPIRED")
                            stopSelf()
                        }
                    }
                } else if (generation == version) {
                    if (status in 200..299) DwcLocationModule.emit("DwcLocationUpload", Arguments.createMap())
                    else DwcLocationModule.locationError("LOCATION_UPLOAD_UNAVAILABLE")
                }
            } catch (_: Exception) {
                if (generation == version) DwcLocationModule.locationError("LOCATION_UPLOAD_UNAVAILABLE")
            } finally {
                connection?.disconnect()
                synchronized(guard) { if (activeConnection === connection) activeConnection = null }
                sending.set(false)
            }
        }
    }

    override fun onDestroy() {
        client.removeLocationUpdates(callback)
        synchronized(guard) { if (ownedGeneration == generation) clearSession() }
        worker.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private val guard = Any()
        @Volatile private var session: TrackingSession? = null
        @Volatile private var generation = 0L
        @Volatile private var activeConnection: HttpURLConnection? = null
        private var pendingStart: Promise? = null
        @Volatile internal var isRunning = false
        internal fun replaceSession(next: TrackingSession, promise: Promise) = synchronized(guard) {
            pendingStart?.reject("LOCATION_REPLACED", "Location session replaced.")
            pendingStart = promise
            generation++
            activeConnection?.disconnect()
            activeConnection = null
            session = next
            isRunning = false
        }
        internal fun abortPendingStart(promise: Promise): Boolean = synchronized(guard) {
            if (pendingStart !== promise) return@synchronized false
            clearSession()
            true
        }
        internal fun clearSession() = synchronized(guard) {
            pendingStart?.reject("LOCATION_STOPPED", "Location sharing stopped.")
            pendingStart = null
            generation++
            session = null
            activeConnection?.disconnect()
            activeConnection = null
            isRunning = false
        }
    }
}
