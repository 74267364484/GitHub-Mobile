package com.octodeck.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stores the GitHub token encrypted with an Android Keystore AES-256-GCM key.
 * If the Keystore is unavailable (rare device issues), falls back to app-private
 * SharedPreferences so the user can still use the app.
 */
class SecurePrefs(context: Context) {
    private val prefs = context.getSharedPreferences("octodeck_secure", Context.MODE_PRIVATE)
    private val alias = "octodeck_token_key"

    fun save(token: String) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val iv = cipher.iv
            val ciphertext = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            prefs.edit()
                .putBoolean("encrypted", true)
                .putString("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
                .putString("ct", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .remove("plain")
                .apply()
        } catch (e: Exception) {
            prefs.edit().putBoolean("encrypted", false).putString("plain", token).remove("iv").remove("ct").apply()
        }
    }

    fun get(): String? {
        return try {
            if (!prefs.getBoolean("encrypted", false)) {
                prefs.getString("plain", null)
            } else {
                val ivText = prefs.getString("iv", null) ?: return null
                val ctText = prefs.getString("ct", null) ?: return null
                val iv = Base64.decode(ivText, Base64.NO_WRAP)
                val ct = Base64.decode(ctText, Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
                String(cipher.doFinal(ct), Charsets.UTF_8)
            }
        } catch (e: Exception) {
            null
        }
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = keyStore.getEntry(alias, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}
