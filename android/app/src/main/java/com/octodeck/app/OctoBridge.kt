package com.octodeck.app

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * JS bridge. Network requests are performed by OkHttp with a custom Dns,
 * so the selected GitHub host mapping really changes the resolved IPv4 edge.
 */
class OctoBridge(
    private val context: Context,
    private val webView: WebView,
    private val onTheme: (String) -> Unit,
) {
    private val prefs = context.getSharedPreferences("octodeck", Context.MODE_PRIVATE)
    private val secure = SecurePrefs(context)
    private val io = Executors.newFixedThreadPool(4)
    private val testPool = Executors.newFixedThreadPool(8)
    private val downloadPool = Executors.newFixedThreadPool(2)
    private val hostState = AtomicReference(loadHostState())
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val bodyMethods = setOf("POST", "PUT", "PATCH")

    private val mappingDns = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            val ip = HostResolver.resolve(hostname, hostState.get())
            return if (ip != null) listOf(InetAddress.getByName(ip)) else Dns.SYSTEM.lookup(hostname)
        }
    }

    private val client: OkHttpClient = OkHttpClient.Builder()
        .dns(mappingDns)
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .callTimeout(50, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    private fun loadHostState(): HostState =
        HostState.fromJson(prefs.getString("host_state", null), HostState(mappingId = HostConfig.defaultMappingId))

    // ---------------- synchronous config methods ----------------

    @JavascriptInterface
    fun getConfig(): String {
        val hasToken = !secure.get().isNullOrBlank()
        return JSONObject().apply {
            put("hasToken", hasToken)
            put("tokenSource", if (hasToken) "native" else "none")
            put("login", prefs.getString("login", "") ?: "")
            put("defaultRepo", "")
            put("host", hostState.get().toJson())
            put("native", true)
            put("version", "1.4.0")
            put("proxy", false)
        }.toString()
    }

    @JavascriptInterface
    fun setToken(token: String): String {
        if (token.isBlank()) secure.clear() else secure.save(token.trim())
        return JSONObject().put("ok", true).toString()
    }

    @JavascriptInterface
    fun clearToken(): String {
        secure.clear()
        prefs.edit().remove("login").apply()
        return JSONObject().put("ok", true).toString()
    }

    @JavascriptInterface
    fun setHost(json: String): String {
        return try {
            val current = hostState.get()
            val next = HostState.fromJson(JSONObject(json), current)
            hostState.set(next)
            prefs.edit().putString("host_state", next.toJson().toString()).apply()
            client.connectionPool.evictAll()
            JSONObject().put("ok", true).put("host", next.toJson()).toString()
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("message", e.message ?: "Invalid host state").toString()
        }
    }

    @JavascriptInterface
    fun setTheme(theme: String) {
        onTheme(theme)
    }

    @JavascriptInterface
    fun openExternal(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme != "http" && uri.scheme != "https" && uri.scheme != "mailto") return
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
        }
    }

    // ---------------- async GitHub API ----------------

    @JavascriptInterface
    fun request(id: String, method: String, path: String, body: String) {
        io.execute {
            if (!path.startsWith("/")) {
                reject(id, "Invalid API path")
                return@execute
            }
            try {
                val httpMethod = method.uppercase()
                val builder = Request.Builder()
                    .url("https://api.github.com$path")
                    .header("Accept", "application/vnd.github+json")
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .header("User-Agent", "GitHub Mobile/1.4 Android")
                val token = secure.get()
                if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
                val reqBody = if (body.isBlank()) null else body.toRequestBody(jsonMedia)
                if (reqBody == null && httpMethod in bodyMethods) {
                    builder.method(httpMethod, ByteArray(0).toRequestBody(null))
                } else {
                    builder.method(httpMethod, reqBody)
                }
                client.newCall(builder.build()).execute().use { response ->
                    val bytes = response.body?.bytes() ?: ByteArray(0)
                    val text = bytes.toString(Charsets.UTF_8)
                    val contentType = response.header("Content-Type") ?: ""
                    val data: Any = when {
                        text.isBlank() -> JSONObject.NULL
                        contentType.contains("json", ignoreCase = true) -> try {
                            JSONTokener(text).nextValue()
                        } catch (e: Exception) {
                            text
                        }
                        else -> text
                    }
                    if (path == "/user" && response.code == 200 && data is JSONObject) {
                        val login = data.optString("login", "")
                        if (login.isNotBlank()) prefs.edit().putString("login", login).apply()
                    }
                    val headers = JSONObject()
                    for (name in response.headers.names()) {
                        headers.put(name.lowercase(), response.headers.values(name).joinToString(", "))
                    }
                    val payload = JSONObject()
                        .put("status", response.code)
                        .put("headers", headers)
                        .put("data", data)
                    resolve(id, payload.toString())
                }
            } catch (e: Exception) {
                reject(id, e.message ?: "GitHub 请求失败")
            }
        }
    }

    @JavascriptInterface
    fun graphql(id: String, body: String) {
        io.execute {
            try {
                val token = secure.get()
                if (token.isNullOrBlank()) {
                    resolve(id, JSONObject().put("errors", JSONArray().put(JSONObject().put("message", "未配置 Token"))).toString())
                    return@execute
                }
                val req = Request.Builder()
                    .url("https://api.github.com/graphql")
                    .header("Authorization", "Bearer $token")
                    .header("User-Agent", "GitHub Mobile/1.4 Android")
                    .header("Accept", "application/vnd.github+json")
                    .post(body.toRequestBody(jsonMedia))
                    .build()
                client.newCall(req).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    val out = if (text.isBlank()) {
                        JSONObject().put("errors", JSONArray().put(JSONObject().put("message", "HTTP ${response.code}"))).toString()
                    } else text
                    resolve(id, out)
                }
            } catch (e: Exception) {
                resolve(id, JSONObject().put("errors", JSONArray().put(JSONObject().put("message", e.message ?: "GraphQL 失败"))).toString())
            }
        }
    }

    // ---------------- host mapping health check ----------------

    @JavascriptInterface
    fun testHosts(id: String) {
        io.execute {
            try {
                val state = hostState.get()
                val mappings = HostConfig.mappings
                val results = Collections.synchronizedList(mutableListOf<JSONObject>())
                val latch = CountDownLatch(mappings.size)
                for (mapping in mappings) {
                    testPool.execute {
                        val started = System.nanoTime()
                        var ip: String? = null
                        try {
                            val hosts: Map<String, String> = when (mapping.id) {
                                "official" -> emptyMap()
                                "custom" -> state.custom
                                else -> mapping.hosts
                            }
                            ip = hosts["api.github.com"]
                            if (mapping.id == "custom" && !HostResolver.isIpv4(ip)) {
                                results.add(
                                    JSONObject().put("id", mapping.id).put("ok", false)
                                        .put("ms", 0).put("ip", JSONObject.NULL).put("error", "未配置 API IP"),
                                )
                            } else {
                                val testClient = clientFor(hosts)
                                try {
                                    val req = Request.Builder()
                                        .url("https://api.github.com/rate_limit")
                                        .header("User-Agent", "GitHub Mobile-Healthcheck")
                                        .header("Accept", "application/vnd.github+json")
                                        .build()
                                    testClient.newCall(req).execute().use { r ->
                                        val ms = ((System.nanoTime() - started) / 1_000_000).toInt()
                                        results.add(
                                            JSONObject().put("id", mapping.id)
                                                .put("ok", r.code in 200..499)
                                                .put("ms", ms)
                                                .put("status", r.code)
                                                .put("ip", ip ?: JSONObject.NULL),
                                        )
                                    }
                                } finally {
                                    testClient.connectionPool.evictAll()
                                    testClient.dispatcher.executorService.shutdown()
                                }
                            }
                        } catch (e: Exception) {
                            val ms = ((System.nanoTime() - started) / 1_000_000).toInt()
                            results.add(
                                JSONObject().put("id", mapping.id).put("ok", false)
                                    .put("ms", ms).put("ip", ip ?: JSONObject.NULL)
                                    .put("error", e.message ?: "连接失败"),
                            )
                        } finally {
                            latch.countDown()
                        }
                    }
                }
                latch.await(22, TimeUnit.SECONDS)
                val ordered = HostConfig.mappings.mapNotNull { m -> results.firstOrNull { it.optString("id") == m.id } }
                val payload = JSONObject().put("proxy", false).put("results", JSONArray(ordered))
                resolve(id, payload.toString())
            } catch (e: Exception) {
                reject(id, e.message ?: "测速失败")
            }
        }
    }

    private fun clientFor(hosts: Map<String, String>): OkHttpClient {
        val dns = object : Dns {
            override fun lookup(hostname: String): List<InetAddress> {
                val ip = hosts[hostname]
                return if (HostResolver.isIpv4(ip)) listOf(InetAddress.getByName(ip)) else Dns.SYSTEM.lookup(hostname)
            }
        }
        return OkHttpClient.Builder()
            .dns(dns)
            .connectionPool(ConnectionPool(0, 1, TimeUnit.NANOSECONDS))
            .dispatcher(Dispatcher())
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .callTimeout(10, TimeUnit.SECONDS)
            .build()
    }

    // ---------------- images through the mapped client ----------------

    @JavascriptInterface
    fun fetchImage(id: String, url: String) {
        io.execute {
            try {
                val uri = Uri.parse(url)
                val host = uri.host.orEmpty()
                if (uri.scheme != "https" || !allowedImageHost(host)) {
                    reject(id, "图片域名不在白名单")
                    return@execute
                }
                val req = Request.Builder()
                    .url(url)
                    .header("User-Agent", "Mozilla/5.0 GitHub Mobile")
                    .header("Accept", "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8")
                    .build()
                client.newCall(req).execute().use { response ->
                    if (!response.isSuccessful) {
                        reject(id, "HTTP ${response.code}")
                        return@execute
                    }
                    val body = response.body
                    if (body == null) {
                        reject(id, "空响应")
                        return@execute
                    }
                    if (body.contentLength() > MAX_IMAGE_BYTES) {
                        reject(id, "图片过大")
                        return@execute
                    }
                    val bytes = body.bytes()
                    if (bytes.size > MAX_IMAGE_BYTES) {
                        reject(id, "图片过大")
                        return@execute
                    }
                    val mime = (body.contentType()?.toString() ?: "image/png").substringBefore(';')
                    val dataUrl = "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                    resolve(id, JSONObject().put("dataUrl", dataUrl).toString())
                }
            } catch (e: Exception) {
                reject(id, e.message ?: "图片加载失败")
            }
        }
    }

    private fun allowedImageHost(host: String): Boolean {
        if (host.isBlank()) return false
        if (host.endsWith(".githubusercontent.com")) return true
        return IMAGE_HOSTS.any { host == it || host.endsWith(".$it") }
    }

    // ---------------- real file downloads ----------------

    /** MainActivity 注入：弹出系统文件选择器，让用户决定保存位置。 */
    var pickDownloadTarget: ((String, String, String, String) -> Unit)? = null

    @JavascriptInterface
    fun startDownload(id: String, url: String, filename: String, accept: String) {
        val uri = Uri.parse(url)
        val host = uri.host.orEmpty()
        if (uri.scheme != "https" || !allowedDownloadHost(host)) {
            downloadError(id, "下载域名不在白名单")
            return
        }
        val name = sanitizeName(filename).ifBlank { "download" }
        val picker = pickDownloadTarget
        if (picker != null) {
            picker(id, url, name, accept)
        } else {
            startDownloadToDefault(id, url, name, accept)
        }
    }

    fun downloadCancelled(id: String) {
        emitDownload(id, JSONObject().put("state", "cancelled").toString())
    }

    fun startDownloadToDefault(id: String, url: String, filename: String, accept: String) {
        downloadPool.execute { runDownload(id, url, filename, accept, null) }
    }

    fun startDownloadToUri(id: String, url: String, filename: String, accept: String, target: Uri) {
        downloadPool.execute { runDownload(id, url, filename, accept, target) }
    }

    private fun runDownload(id: String, rawUrl: String, rawName: String, accept: String, target: Uri?) {
        try {
            var name = sanitizeName(rawName)
            val builder = Request.Builder()
                .url(rawUrl)
                .header("User-Agent", "GitHub Mobile/1.4 Android")
                .header("Accept", accept.ifBlank { "application/octet-stream" })
                .header("Accept-Encoding", "identity")
                .header("X-GitHub-Api-Version", "2022-11-28")
            secure.get()?.takeIf { it.isNotBlank() }?.let { builder.header("Authorization", "Bearer $it") }

            val downloadClient = client.newBuilder()
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .writeTimeout(0, TimeUnit.MILLISECONDS)
                .callTimeout(0, TimeUnit.MILLISECONDS)
                .build()

            downloadClient.newCall(builder.build()).execute().use { response ->
                if (!response.isSuccessful) {
                    val detail = try {
                        response.body?.string()?.take(300)
                    } catch (_: Exception) {
                        null
                    }
                    downloadError(id, "HTTP ${response.code}" + (detail?.takeIf { it.isNotBlank() }?.let { "：$it" } ?: ""))
                    return
                }
                val body = response.body
                if (body == null) {
                    downloadError(id, "服务器返回了空响应")
                    return
                }
                if (name.isBlank()) name = filenameFromDisposition(response.header("Content-Disposition"))
                if (name.isBlank()) name = "download"
                val total = body.contentLength()
                val saved = if (target != null) {
                    saveToUri(target, body.byteStream()) { received -> downloadProgress(id, received, total) }
                    target.toString()
                } else {
                    saveToDownloads(name, body.byteStream(), total) { received ->
                        downloadProgress(id, received, total)
                    }
                }
                downloadDone(id, saved, total)
            }
        } catch (e: Exception) {
            downloadError(id, e.message ?: "下载失败")
        }
    }

    private fun saveToUri(target: Uri, input: InputStream, onProgress: (Long) -> Unit) {
        val output = context.contentResolver.openOutputStream(target)
            ?: throw IllegalStateException("无法写入所选位置")
        output.use { copyStream(input, it, onProgress) }
    }

    private fun saveToDownloads(
        name: String,
        input: InputStream,
        total: Long,
        onProgress: (Long) -> Unit,
    ): String {
        val mime = mimeFor(name)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.MIME_TYPE, mime)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/GitHub Mobile")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("无法创建下载文件")
            try {
                resolver.openOutputStream(target)?.use { output ->
                    copyStream(input, output, onProgress)
                } ?: throw IllegalStateException("无法写入下载文件")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(target, values, null, null)
                return "Downloads/GitHub Mobile/$name"
            } catch (e: Exception) {
                try { resolver.delete(target, null, null) } catch (_: Exception) {}
                throw e
            }
        }
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        dir.mkdirs()
        val file = uniqueFile(dir, name)
        FileOutputStream(file).use { output -> copyStream(input, output, onProgress) }
        return file.absolutePath
    }

    private fun copyStream(input: InputStream, output: OutputStream, onProgress: (Long) -> Unit) {
        val buffer = ByteArray(64 * 1024)
        var received = 0L
        var last = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            received += read
            val now = System.currentTimeMillis()
            if (now - last >= 200) {
                last = now
                onProgress(received)
            }
        }
        output.flush()
        onProgress(received)
    }

    private fun uniqueFile(dir: File, name: String): File {
        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var candidate = File(dir, name)
        var index = 1
        while (candidate.exists()) {
            candidate = File(dir, "$stem($index)$ext")
            index++
        }
        return candidate
    }

    private fun sanitizeName(raw: String): String {
        val cleaned = raw.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trimStart('.')
        return cleaned.take(180)
    }

    private fun filenameFromDisposition(value: String?): String {
        if (value.isNullOrBlank()) return ""
        val star = Regex("filename\\*\\s*=\\s*UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(value)
        if (star != null) {
            return try {
                sanitizeName(Uri.decode(star.groupValues[1].trim().trim('"')))
            } catch (_: Exception) {
                ""
            }
        }
        val plain = Regex("filename\\s*=\\s*\"?([^\";]+)", RegexOption.IGNORE_CASE).find(value)
        return plain?.let { sanitizeName(it.groupValues[1]) } ?: ""
    }

    private fun mimeFor(name: String): String {
        return when (name.substringAfterLast('.', "").lowercase()) {
            "zip" -> "application/zip"
            "gz", "tgz" -> "application/gzip"
            "tar" -> "application/x-tar"
            "diff", "patch", "txt", "md", "json", "yml", "yaml", "xml", "log", "csv" -> "text/plain"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "svg" -> "image/svg+xml"
            "webp" -> "image/webp"
            "pdf" -> "application/pdf"
            "apk" -> "application/vnd.android.package-archive"
            "jar" -> "application/java-archive"
            "mp4" -> "video/mp4"
            "mp3" -> "audio/mpeg"
            else -> "application/octet-stream"
        }
    }

    private fun allowedDownloadHost(host: String): Boolean {
        if (host.isBlank()) return false
        if (host.endsWith(".githubusercontent.com")) return true
        return DOWNLOAD_HOSTS.any { host == it || host.endsWith(".$it") }
    }

    private fun downloadProgress(id: String, received: Long, total: Long) {
        val payload = JSONObject()
            .put("state", "downloading")
            .put("received", received)
            .put("total", if (total > 0) total else JSONObject.NULL)
        emitDownload(id, payload.toString())
    }

    private fun downloadDone(id: String, path: String, total: Long) {
        val payload = JSONObject()
            .put("state", "done")
            .put("path", path)
            .put("total", if (total > 0) total else JSONObject.NULL)
        emitDownload(id, payload.toString())
    }

    private fun downloadError(id: String, message: String) {
        val payload = JSONObject().put("state", "error").put("error", message)
        emitDownload(id, payload.toString())
    }

    private fun emitDownload(id: String, payload: String) {
        val script = "window.__octoDownloadProgress && window.__octoDownloadProgress(${JSONObject.quote(id)}, ${JSONObject.quote(payload)})"
        webView.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Exception) {
            }
        }
    }

    // ---------------- JS callbacks ----------------

    private fun resolve(id: String, payload: String) {
        val script = "window.__octoDeckResolve(${JSONObject.quote(id)}, ${JSONObject.quote(payload)}, \"\")"
        webView.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Exception) {
            }
        }
    }

    private fun reject(id: String, message: String) {
        val script = "window.__octoDeckResolve(${JSONObject.quote(id)}, \"\", ${JSONObject.quote(message)})"
        webView.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Exception) {
            }
        }
    }

    fun shutdown() {
        io.shutdownNow()
        testPool.shutdownNow()
        downloadPool.shutdownNow()
        client.connectionPool.evictAll()
    }

    companion object {
        private const val MAX_IMAGE_BYTES = 3 * 1024 * 1024
        private val DOWNLOAD_HOSTS = listOf(
            "api.github.com",
            "github.com",
            "codeload.github.com",
            "raw.githubusercontent.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
            "github-releases.githubusercontent.com",
            "uploads.github.com",
        )
        private val IMAGE_HOSTS = listOf(
            "github.com",
            "avatars.githubusercontent.com",
            "raw.githubusercontent.com",
            "user-images.githubusercontent.com",
            "private-user-images.githubusercontent.com",
            "camo.githubusercontent.com",
            "objects.githubusercontent.com",
            "github.githubassets.com",
            "img.shields.io",
            "shields.io",
            "badgen.net",
        )
    }
}
