package com.octodeck.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicInteger

/**
 * Keeps the process alive while files are downloading.
 *
 * The actual transfer still runs on OctoBridge's OkHttp pool; this foreground
 * service only supplies the process priority and a partial wake lock so the
 * download is not frozen when the activity goes to the background.
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
        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWakeLock()
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
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
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("GitHub Mobile")
            .setContentText("正在下载，离开应用也会继续")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_LOW)
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

        private val active = AtomicInteger(0)

        fun acquire(context: Context) {
            val app = context.applicationContext
            if (active.incrementAndGet() != 1) return
            try {
                val intent = Intent(app, DownloadService::class.java).setAction(ACTION_START)
                ContextCompat.startForegroundService(app, intent)
            } catch (_: Exception) {
                active.set(0)
            }
        }

        fun release(context: Context) {
            val app = context.applicationContext
            if (active.decrementAndGet() > 0) return
            active.set(0)
            try {
                app.stopService(Intent(app, DownloadService::class.java).setAction(ACTION_STOP))
            } catch (_: Exception) {
            }
        }
    }
}
