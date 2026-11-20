package com.octodeck.app

import android.annotation.SuppressLint
import android.content.Intent
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

    private data class PendingDownload(val id: String, val url: String, val name: String, val accept: String)

    private val createDownload = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val pending = pendingDownload
        pendingDownload = null
        if (pending != null) {
            if (uri == null) bridge.downloadCancelled(pending.id)
            else bridge.startDownloadToUri(pending.id, pending.url, pending.name, pending.accept, uri)
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
        bridge.pickDownloadTarget = { id, url, name, accept ->
            runOnUiThread {
                pendingDownload = PendingDownload(id, url, name, accept)
                try {
                    createDownload.launch(name)
                } catch (e: Exception) {
                    pendingDownload = null
                    bridge.startDownloadToDefault(id, url, name, accept)
                }
            }
        }
        webView.addJavascriptInterface(bridge, "OctoDeck")
        webView.loadUrl(APP_URL)

        onBackPressedDispatcher.addCallback(this) { handleBack() }
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
            userAgentString = userAgentString + " GitHub Mobile/1.3 Android"
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
                openExternal(uri)
                return true
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
        webView.removeJavascriptInterface("OctoDeck")
        bridge.shutdown()
        webView.loadUrl("about:blank")
        webView.destroy()
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val APP_URL = "https://appassets.androidplatform.net/assets/www/index.html"

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
