package com.octodeck.app

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * In-app GitHub web view. Used only for pages that have no native equivalent yet
 * (OAuth authorization, login, token management, marketplace).
 * The JS bridge is never exposed to remote content.
 */
class GitHubWebActivity : ComponentActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val rawUrl = intent.getStringExtra("url").orEmpty()
        val parsed = try {
            Uri.parse(rawUrl)
        } catch (_: Exception) {
            null
        }
        if (parsed == null || parsed.scheme != "https" || !isAllowedHost(parsed.host.orEmpty())) {
            Toast.makeText(this, "无法打开该链接", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
        }

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(dp(14), 0, dp(6), 0)
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, dp(52))
        }
        val title = TextView(this).apply {
            text = "GitHub 网页 · 应用内"
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#1F2328"))
            layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
        }
        val close = TextView(this).apply {
            text = "关闭"
            textSize = 14f
            setTextColor(Color.parseColor("#0969DA"))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setOnClickListener { finish() }
        }
        bar.addView(title)
        bar.addView(close)

        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, dp(2))
            visibility = View.VISIBLE
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f)
        }

        root.addView(bar)
        root.addView(progress)
        root.addView(webView)
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

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            loadsImagesAutomatically = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString + " GitHub Mobile/1.6.2 Android"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                if (target.scheme == "https" && isAllowedHost(target.host.orEmpty())) return false
                handleRedirect(target)
                return true
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                val target = Uri.parse(url)
                if (target.scheme == "https" && isAllowedHost(target.host.orEmpty())) return false
                handleRedirect(target)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startWebDownload(url, userAgent, contentDisposition, mimeType)
        }

        webView.loadUrl(rawUrl)
        onBackPressedDispatcher.addCallback(this) {
            if (webView.canGoBack()) webView.goBack() else finish()
        }
    }

    private fun handleRedirect(uri: Uri) {
        if (uri.scheme == "githubmobile") {
            try {
                startActivity(
                    Intent(this, MainActivity::class.java)
                        .setAction(Intent.ACTION_VIEW)
                        .setData(uri)
                        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                )
                finish()
            } catch (_: Exception) {
                Toast.makeText(this, "无法返回 GitHub Mobile", Toast.LENGTH_SHORT).show()
            }
            return
        }

        val host = uri.host.orEmpty()
        val label = if (host.isNotBlank()) host else uri.scheme.orEmpty()
        AlertDialog.Builder(this)
            .setTitle("已离开 GitHub")
            .setMessage("授权流程即将返回 $label。是否把结果交给对应的应用完成？")
            .setPositiveButton("交给原应用") { _, _ -> launchExternal(uri) }
            .setNegativeButton("留在应用内", null)
            .setNeutralButton("复制链接") { _, _ -> copyLink(uri.toString()) }
            .show()
    }

    private fun launchExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
        } catch (_: Exception) {
            copyLink(uri.toString())
            Toast.makeText(this, "没有找到可处理该链接的应用，已复制链接", Toast.LENGTH_LONG).show()
        }
    }

    private fun copyLink(value: String) {
        try {
            val manager = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            manager.setPrimaryClip(ClipData.newPlainText("link", value))
            Toast.makeText(this, "链接已复制", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
        }
    }

    private fun startWebDownload(url: String, userAgent: String?, contentDisposition: String?, mimeType: String?) {
        try {
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                userAgent?.let { addRequestHeader("User-Agent", it) }
                setMimeType(mimeType)
                setTitle(name)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalFilesDir(this@GitHubWebActivity, Environment.DIRECTORY_DOWNLOADS, name)
            }
            val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            Toast.makeText(this, "开始下载 $name", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(this, "下载失败", Toast.LENGTH_SHORT).show()
        }
    }

    private fun isAllowedHost(host: String): Boolean {
        val h = host.lowercase()
        return h == "github.com" ||
            h == "www.github.com" ||
            h == "gist.github.com" ||
            h == "docs.github.com" ||
            h.endsWith(".github.com") ||
            h == "githubusercontent.com" ||
            h.endsWith(".githubusercontent.com") ||
            h == "githubassets.com" ||
            h.endsWith(".githubassets.com")
    }

    override fun onDestroy() {
        try {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.destroy()
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
