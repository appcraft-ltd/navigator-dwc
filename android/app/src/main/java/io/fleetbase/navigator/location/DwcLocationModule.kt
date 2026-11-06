package io.fleetbase.navigator.location

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import java.lang.ref.WeakReference
import java.net.URI


internal data class TrackingSession(val url: String, val authorization: String)

class DwcLocationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var configured: TrackingSession? = null

    init { emitter = WeakReference(context) }
    override fun getName() = "DwcLocation"

    @ReactMethod fun addListener(name: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod fun configure(options: ReadableMap, promise: Promise) {
        try {
            val url = options.getString("url") ?: error("Tracking URL required")
            val uri = URI(url)
            require(uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.userInfo == null && uri.fragment == null && uri.query == null)
            require(uri.path.matches(Regex("/v1/drivers/[A-Za-z0-9_-]+/track")))
            val authorization = options.getMap("headers")?.getString("Authorization") ?: error("Driver session required")
            require(authorization.startsWith("Bearer ") && authorization.length > 7 && !authorization.contains('\n') && !authorization.contains('\r'))
            configured = TrackingSession(url, authorization)
            promise.resolve(Arguments.createMap().apply { putBoolean("enabled", DwcLocationService.isRunning) })
        } catch (_: Exception) {
            configured = null
            promise.reject("LOCATION_CONFIG", "A secure driver tracking session is required.")
        }
    }

    @ReactMethod fun start(promise: Promise) {
        val session = configured
        if (session == null || context.currentActivity == null || !hasPermission(context)) {
            promise.reject("LOCATION_PERMISSION", "Open the app and allow location before going online.")
            return
        }
        try {
            DwcLocationService.replaceSession(session, promise)
            ContextCompat.startForegroundService(context, Intent(context, DwcLocationService::class.java))
            Handler(Looper.getMainLooper()).postDelayed({
                if (DwcLocationService.abortPendingStart(promise)) context.stopService(Intent(context, DwcLocationService::class.java))
            }, 15000)
        } catch (_: Exception) {
            DwcLocationService.clearSession()
            promise.reject("LOCATION_START", "Location sharing could not start. Open the app and try again.")
        }
    }

    @ReactMethod fun stop(promise: Promise) {
        // Erase credentials before asking Android to stop the service. Old
        // coordinates cannot be sent with another driver's session.
        configured = null
        DwcLocationService.clearSession()
        context.stopService(Intent(context, DwcLocationService::class.java))
        promise.resolve(null)
    }

    @ReactMethod fun getCurrentPosition(promise: Promise) {
        if (!hasPermission(context)) {
            promise.reject("LOCATION_PERMISSION", "Location permission is required.")
            return
        }
        val cancellation = CancellationTokenSource()
        val handler = Handler(Looper.getMainLooper())
        var settled = false
        val timeout = Runnable {
            if (!settled) {
                settled = true
                cancellation.cancel()
                promise.reject("LOCATION_TIMEOUT", "A current location is unavailable.")
            }
        }
        handler.postDelayed(timeout, 20000)
        try {
            LocationServices.getFusedLocationProviderClient(context)
                .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
                .addOnCompleteListener { task ->
                    if (!settled) {
                        settled = true
                        handler.removeCallbacks(timeout)
                        if (task.isSuccessful && task.result != null) promise.resolve(locationMap(task.result))
                        else promise.reject("LOCATION_UNAVAILABLE", "A current location is unavailable.")
                    }
                }
        } catch (_: SecurityException) {
            handler.removeCallbacks(timeout)
            settled = true
            promise.reject("LOCATION_PERMISSION", "Location permission is required.")
        }
    }

    companion object {
        private var emitter: WeakReference<ReactApplicationContext>? = null
        internal fun hasPermission(context: android.content.Context) = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        internal fun timestamp(milliseconds: Long): String = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }.format(java.util.Date(milliseconds))
        internal fun locationMap(location: Location): WritableMap = Arguments.createMap().apply {
            putString("timestamp", DwcLocationModule.timestamp(location.time))
            putMap("coords", Arguments.createMap().apply {
                putDouble("latitude", location.latitude)
                putDouble("longitude", location.longitude)
                putDouble("accuracy", location.accuracy.toDouble())
                putDouble("heading", location.bearing.toDouble())
                putDouble("speed", location.speed.toDouble())
                putDouble("altitude", location.altitude)
            })
        }
        internal fun emit(name: String, value: WritableMap) {
            val context = emitter?.get() ?: return
            if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, value)
        }
        internal fun locationError(code: String) = emit("DwcLocationError", Arguments.createMap().apply { putString("code", code) })
    }
}
