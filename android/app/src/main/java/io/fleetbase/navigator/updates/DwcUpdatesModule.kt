package io.fleetbase.navigator.updates

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// Public release metadata only. Never attach a driver token to these requests.
class DwcUpdatesModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val executor = Executors.newSingleThreadExecutor()
    private val client = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS).callTimeout(5, TimeUnit.MINUTES).build()
    private var candidate: JSONObject? = null
    private var downloaded: Pair<JSONObject, File>? = null
    private val directory get() = File(context.cacheDir, "driver-updates").apply { mkdirs() }
    override fun getName() = "DwcUpdates"

    override fun getConstants(): Map<String, Any> = mapOf("versionCode" to installed().longVersionCodeCompat())

    @ReactMethod fun isUnmetered(promise: Promise) {
        val network = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        promise.resolve(!network.isActiveNetworkMetered)
    }

    private fun installed() = context.packageManager.getPackageInfo(context.packageName, signatureFlags())
    private fun signatureFlags() = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    private fun android.content.pm.PackageInfo.longVersionCodeCompat() = if (Build.VERSION.SDK_INT >= 28) longVersionCode else versionCode.toLong()
    private fun android.content.pm.PackageInfo.signers(): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) signingInfo?.apkContentsSigners else signatures
        return signatures?.map { sha256(it.toByteArray()) }?.toSet() ?: emptySet()
    }
    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun validateMetadata(json: JSONObject) {
        require(json.getString("package") == context.packageName)
        require(json.getLong("versionCode") > installed().longVersionCodeCompat())
        require(json.getString("versionName").matches(Regex("[0-9A-Za-z.+-]{1,40}")))
        require(json.getString("sha256").matches(Regex("[a-f0-9]{64}")))
        require(json.getLong("size") in 1..MAX_APK_BYTES)
        val uri = Uri.parse(json.getString("url"))
        require(uri.scheme == "https" && uri.host == "github.com" && uri.port == -1 && uri.userInfo == null && uri.query == null && uri.fragment == null)
        require(uri.path?.matches(Regex("/appcraft-ltd/navigator-dwc/releases/download/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\\.apk")) == true)
    }

    @ReactMethod fun check(promise: Promise) = executor.execute {
        try {
            val request = Request.Builder().url(CHANNEL_URL).header("Cache-Control", "no-cache").build()
            val json = client.newCall(request).execute().use { response ->
                require(response.isSuccessful)
                val source = response.body ?: error("No release metadata")
                val bytes = source.byteStream().use { it.readBytesBounded(16 * 1024) }
                JSONObject(String(bytes, Charsets.UTF_8))
            }
            require(json.getString("package") == context.packageName)
            require(json.getLong("versionCode") >= 1)
            if (json.getLong("versionCode") <= installed().longVersionCodeCompat()) {
                candidate = null
                promise.resolve(null)
            } else {
                validateMetadata(json)
                candidate = json
                promise.resolve(Arguments.createMap().apply {
                    putString("versionName", json.getString("versionName"))
                    putDouble("versionCode", json.getLong("versionCode").toDouble())
                    putDouble("size", json.getLong("size").toDouble())
                })
            }
        } catch (_: Exception) {
            candidate = null
            promise.reject("UPDATE_CHECK", "Updates could not be checked. Check your connection and try again.")
        }
    }

    @ReactMethod fun download(promise: Promise) = executor.execute {
        var partial: File? = null
        try {
            val release = candidate ?: error("Check for a release first")
            validateMetadata(release)
            directory.listFiles()?.forEach { it.delete() }
            downloaded = null
            val file = File(directory, "update.apk.part").also { partial = it }
            client.newCall(Request.Builder().url(release.getString("url")).build()).execute().use { response ->
                require(response.isSuccessful)
                val body = response.body ?: error("Missing APK")
                val expectedSize = release.getLong("size")
                require(body.contentLength() == -1L || body.contentLength() == expectedSize)
                body.byteStream().use { input -> file.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= expectedSize && total <= MAX_APK_BYTES)
                        output.write(buffer, 0, count)
                    }
                    require(total == expectedSize)
                } }
            }
            verifyApk(release, file)
            val ready = File(directory, "update.apk")
            require(file.renameTo(ready))
            downloaded = release to ready
            promise.resolve(null)
        } catch (_: Exception) {
            partial?.delete()
            downloaded = null
            promise.reject("UPDATE_DOWNLOAD", "The update could not be downloaded or verified. Try again.")
        }
    }

    private fun verifyApk(release: JSONObject, file: File) {
        validateMetadata(release)
        require(file.isFile && file.length() == release.getLong("size"))
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) }
        }
        require(digest.digest().joinToString("") { "%02x".format(it) } == release.getString("sha256"))
        val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, signatureFlags()) ?: error("Invalid package")
        val current = installed()
        require(archive.packageName == current.packageName)
        require(archive.longVersionCodeCompat() == release.getLong("versionCode"))
        require(archive.versionName == release.getString("versionName"))
        require(current.signers().isNotEmpty() && archive.signers() == current.signers())
    }

    @ReactMethod fun install(promise: Promise) = executor.execute {
        try {
            val (release, file) = downloaded ?: error("Download the update first")
            verifyApk(release, file)
            val activity = context.currentActivity ?: error("Open the app first")
            activity.runOnUiThread {
                try {
                    if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
                        activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
                        promise.resolve("permission")
                    } else {
                        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
                        activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                        promise.resolve("installer")
                    }
                } catch (_: Exception) { promise.reject("UPDATE_INSTALL", "Android could not open the installer. Try again.") }
            }
        } catch (_: Exception) { promise.reject("UPDATE_INSTALL", "The downloaded update is unavailable. Download it again.") }
    }

    private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            require(output.size() + count <= limit)
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
    companion object {
        private const val MAX_APK_BYTES = 160L * 1024 * 1024
        private const val CHANNEL_URL = "https://raw.githubusercontent.com/appcraft-ltd/navigator-dwc/codex/android-update-channel/updates/android-apk.json"
    }
}
