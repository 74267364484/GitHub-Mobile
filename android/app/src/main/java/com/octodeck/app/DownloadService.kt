package com.octodeck.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Keeps the process alive while files are downloading.
 *
 * The transfer itself runs on OctoBridge's OkHttp pool; this foreground service
 * supplies process priority and a partial wake lock so Android does not freeze
 * the download when the activity goes to the background.
 *
 * The service is started as soon as the user taps download, before any system
 * file picker opens. Android 12+ rejects foreground-service starts from the
 * background, and the activity-result callback for the picker runs while the
 * app is still transitioning back to the foreground.
 */
class DownloadService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        return try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else {
                0
            }
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
            acquireWakeLock()
            START_NOT_STICKY
        } catch (_: Exception) {
            // If the system refuses the foreground promotion, do not leave a
            // half-started service behind. The transfer can still finish while
            // the app is in the foreground, and the next download retries.
            stopSelf()
            START_NOT_STICKY
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        markServiceStopped()
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GitHubMobile:download").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (_: Exception) {
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
        }
        wakeLock = null
    }

    private fun buildNotification(): Notification {
        val open = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_download)
            .setContentTitle("GitHub Mobile")
            .setContentText("正在下载，离开应用也会继续")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pending)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "下载", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "在后台继续下载 GitHub 文件"
                        setShowBadge(false)
                    },
                )
            }
        }
    }

    companion object {
        private const val CHANNEL_ID = "github_mobile_downloads"
        private const val NOTIFICATION_ID = 4102
        private const val ACTION_START = "com.octodeck.app.action.DOWNLOAD_START"
        private const val ACTION_STOP = "com.octodeck.app.action.DOWNLOAD_STOP"

        private val lock = Any()
        private var active = 0
        private var serviceUp = false

        /**
         * Marks one download as active. The service is started only while the
         * app is still in the foreground, which is why callers must invoke this
         * before opening the system directory picker.
         */
        fun acquire(context: Context) {
            val app = context.applicationContext
            val start = synchronized(lock) {
                active += 1
                if (serviceUp) {
                    false
                } else {
                    serviceUp = true
                    true
                }
            }
            if (!start) return
            try {
                val intent = Intent(app, DownloadService::class.java).setAction(ACTION_START)
                ContextCompat.startForegroundService(app, intent)
            } catch (_: Exception) {
                synchronized(lock) { serviceUp = false }
            }
        }

        /** Marks one download as finished and stops the service with the last one. */
        fun release(context: Context) {
            val app = context.applicationContext
            val stop = synchronized(lock) {
                active = (active - 1).coerceAtLeast(0)
                if (active == 0) {
                    serviceUp = false
                    true
                } else {
                    false
                }
            }
            if (!stop) return
            try {
                app.stopService(Intent(app, DownloadService::class.java).setAction(ACTION_STOP))
            } catch (_: Exception) {
            }
        }

        /**
         * Called from the service when it is destroyed. If the system killed it
         * while downloads were still running, the next download will start it
         * again instead of being stuck behind a stale "already running" flag.
         */
        private fun markServiceStopped() {
            synchronized(lock) { serviceUp = false }
        }
    }
}
