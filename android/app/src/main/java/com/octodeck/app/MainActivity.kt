package com.octodeck.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.URLUtil
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import android.graphics.Typeface
import android.widget.Toast
import org.json.JSONObject
import java.io.ByteArrayInputStream

class MainActivity : ComponentActivity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var splash: FrameLayout
    private lateinit var splashStatus: TextView
    private lateinit var splashProgress: ProgressBar
    private lateinit var bridge: OctoBridge
    private var splashHidden = false
    private var pendingDownload: PendingDownload? = null
    private var pendingDirId: String? = null
    private val pendingLinks = mutableListOf<String>()
    private var webReady = false
    private var notificationAsked = false

    private val requestNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private data class PendingDownload(val id: String, val url: String, val name: String, val accept: String)

    private val pickDownloadTree = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        val pending = pendingDownload
        val dirId = pendingDirId
        pendingDownload = null
        pendingDirId = null
        if (uri == null) {
            if (pending != null) bridge.downloadCancelled(pending.id)
            if (dirId != null) bridge.rejectDownloadDir(dirId, "已取消选择文件夹")
            return@registerForActivityResult
        }
        try {
            contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        } catch (_: Exception) {
        }
        getSharedPreferences("octodeck", MODE_PRIVATE).edit().putString("download_tree", uri.toString()).apply()
        if (pending != null) {
            ensureNotificationPermission()
            bridge.startDownloadToTree(pending.id, pending.url, pending.name, pending.accept, uri)
        }
        if (dirId != null) {
            bridge.resolveDownloadDir(dirId, uri)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }

        root = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        webView = WebView(this).apply { setBackgroundColor(Color.WHITE) }
        root.addView(webView, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        buildSplash()
        root.addView(splash, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(0, bars.top, 0, bars.bottom)
            insets
        }
        WindowInsetsControllerCompat(window, root).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        HostConfig.load(this)
        setupWebView()
        bridge = OctoBridge(this, webView) { theme -> applyTheme(theme) }
        bridge.askDownloadTree = { id, url, name, accept ->
            runOnUiThread {
                pendingDownload = PendingDownload(id, url, name, accept)
                try {
                    pickDownloadTree.launch(null)
                } catch (e: Exception) {
                    pendingDownload = null
                    bridge.startDownloadToDefault(id, url, name, accept)
                }
            }
        }
        bridge.askDownloadDir = { id ->
            runOnUiThread {
                pendingDirId = id
                try {
                    pickDownloadTree.launch(null)
                } catch (e: Exception) {
                    pendingDirId = null
                    bridge.rejectDownloadDir(id, "无法打开文件夹选择器")
                }
            }
        }
        bridge.onDownloadRequested = {
            runOnUiThread { ensureNotificationPermission() }
        }
        webView.addJavascriptInterface(bridge, "OctoDeck")
        bridge.onWebReady = {
            runOnUiThread {
                webReady = true
                flushPendingLinks()
            }
        }
        webView.loadUrl(APP_URL)
        handleDeepLinkIntent(intent)

        onBackPressedDispatcher.addCallback(this) { handleBack() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLinkIntent(intent)
    }

    private fun handleDeepLinkIntent(intent: Intent?) {
        if (intent == null) return
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.toString()?.let { enqueueDeepLink(it) }
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                if (text.isNotBlank()) {
                    val matches = GITHUB_URL_RE.findAll(text).map { it.value }.toList()
                    if (matches.isNotEmpty()) {
                        matches.forEach { enqueueDeepLink(it) }
                    } else {
                        val bare = BARE_GITHUB_RE.find(text)?.value
                        if (bare != null) enqueueDeepLink("https://$bare")
                    }
                }
            }
        }
    }

    private fun enqueueDeepLink(url: String) {
        if (url.isBlank()) return
        pendingLinks.add(url)
        flushPendingLinks()
    }

    private fun flushPendingLinks() {
        if (!webReady || pendingLinks.isEmpty()) return
        val batch = pendingLinks.toList()
        pendingLinks.clear()
        for (url in batch) {
            val script = "window.__octoOpenUrl && window.__octoOpenUrl(${JSONObject.quote(url)})"
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Exception) {
            }
        }
    }

    private fun buildSplash() {
        splash = FrameLayout(this).apply { setBackgroundColor(getColor(R.color.splash_bg)) }

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.CENTER)
        }

        val logo = ImageView(this).apply {
            setImageResource(R.drawable.splash_logo)
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams = LinearLayout.LayoutParams(dp(104), dp(104))
        }
        val title = TextView(this).apply {
            text = "GitHub Mobile"
            textSize = 24f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(getColor(R.color.splash_fg))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dp(18) }
        }
        val subtitle = TextView(this).apply {
            text = getString(R.string.splash_subtitle)
            textSize = 12f
            setTextColor(getColor(R.color.splash_muted))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dp(4) }
        }
        splashProgress = ProgressBar(this).apply {
            indeterminateTintList = ColorStateList.valueOf(getColor(R.color.brand_green))
            layoutParams = LinearLayout.LayoutParams(dp(22), dp(22)).apply { topMargin = dp(22) }
        }
        splashStatus = TextView(this).apply {
            text = getString(R.string.splash_loading)
            textSize = 11f
            setTextColor(getColor(R.color.splash_muted))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dp(10) }
        }

        box.addView(logo)
        box.addView(title)
        box.addView(subtitle)
        box.addView(splashProgress)
        box.addView(splashStatus)
        splash.addView(box)
    }

    private fun setupWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            loadsImagesAutomatically = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString + " GitHub Mobile/1.6.2 Android"
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                // The bridge is only exposed to our local asset origin. Never load remote pages here.
                if (request.url.host != "appassets.androidplatform.net") {
                    return WebResourceResponse(
                        "text/plain", "utf-8", 403, "Forbidden", emptyMap(),
                        ByteArrayInputStream(ByteArray(0)),
                    )
                }
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == "appassets.androidplatform.net") return false
                val host = uri.host.orEmpty().lowercase()
                if (host == "github.com" || host == "www.github.com" || host == "gist.github.com") {
                    enqueueDeepLink(uri.toString())
                    return true
                }
                openExternal(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                webReady = false
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                view.postDelayed({ hideSplash() }, 260)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    runOnUiThread {
                        splashProgress.visibility = View.GONE
                        splashStatus.text = "界面加载失败：${error.description}"
                    }
                }
            }
        }

        webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            bridge.startDownload("web" + System.currentTimeMillis().toString(36), url, name, mimeType.ifBlank { "*/*" })
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(cm: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) {
                    Log.d("OctoDeckWeb", "${cm.message()} (${cm.sourceId()}:${cm.lineNumber()})")
                }
                return true
            }
        }
    }

    private fun hideSplash() {
        if (splashHidden) return
        splashHidden = true
        if (splash.parent == null) return
        splash.animate().alpha(0f).setDuration(240).withEndAction {
            if (splash.parent != null) root.removeView(splash)
        }.start()
    }

    private fun openExternal(uri: Uri) {
        if (uri.scheme != "http" && uri.scheme != "https" && uri.scheme != "mailto") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            Toast.makeText(this, "无法打开链接", Toast.LENGTH_SHORT).show()
        }
    }

    private fun applyTheme(theme: String) {
        runOnUiThread {
            val dark = theme == "dark"
            val bg = if (dark) Color.parseColor("#0D1117") else Color.WHITE
            root.setBackgroundColor(bg)
            webView.setBackgroundColor(bg)
            WindowInsetsControllerCompat(window, root).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }

    private fun handleBack() {
        webView.evaluateJavascript(BACK_JS) { result ->
            val handled = result != null && result != "null" && result != "\"\""
            if (!handled) {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        }
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        pendingDownload?.let { bridge.downloadCancelled(it.id) }
        pendingDownload = null
        webView.removeJavascriptInterface("OctoDeck")
        bridge.shutdown()
        webView.loadUrl("about:blank")
        webView.destroy()
        super.onDestroy()
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationAsked) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        notificationAsked = true
        try {
            requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        } catch (_: Exception) {
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val APP_URL = "https://appassets.androidplatform.net/assets/www/index.html"

        private val GITHUB_URL_RE = Regex(
            """https?://(?:www\.)?(?:gist\.)?github\.com/[^\s<>"']+""",
            RegexOption.IGNORE_CASE,
        )
        private val BARE_GITHUB_RE = Regex(
            """(?:www\.)?(?:gist\.)?github\.com/[^\s<>"']+""",
            RegexOption.IGNORE_CASE,
        )

        private val BACK_JS = """
            (function () {
              var cancel = document.querySelector('.mobile-search-cancel');
              if (cancel) { cancel.click(); return 'search'; }
              var dialog = document.querySelector('.dialog-backdrop');
              if (dialog) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                return 'dialog';
              }
              var rail = document.querySelector('.rail-backdrop');
              if (rail) { rail.click(); return 'drawer'; }
              return '';
            })();
        """.trimIndent()
    }
}
