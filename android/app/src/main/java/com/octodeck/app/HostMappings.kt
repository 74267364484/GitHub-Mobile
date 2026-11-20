package com.octodeck.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class Mapping(
    val id: String,
    val name: String,
    val short: String,
    val hosts: Map<String, String>,
)

data class HostState(
    val enabled: Boolean = true,
    val mappingId: String = "sg",
    val custom: Map<String, String> = emptyMap(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("enabled", enabled)
        put("mappingId", mappingId)
        put("custom", JSONObject().apply {
            for ((k, v) in custom) put(k, v)
        })
    }

    companion object {
        fun fromJson(raw: String?, defaults: HostState = HostState()): HostState {
            if (raw.isNullOrBlank()) return defaults
            return try {
                fromJson(JSONObject(raw), defaults)
            } catch (e: Exception) {
                defaults
            }
        }

        fun fromJson(obj: JSONObject, defaults: HostState = HostState()): HostState {
            val mappingId = obj.optString("mappingId", defaults.mappingId).ifBlank { defaults.mappingId }
            val custom = mutableMapOf<String, String>()
            obj.optJSONObject("custom")?.let { c ->
                val keys = c.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    custom[k] = c.optString(k, "")
                }
            }
            return HostState(
                enabled = obj.optBoolean("enabled", defaults.enabled),
                mappingId = mappingId,
                custom = custom,
            )
        }
    }
}

object HostResolver {
    private val IPV4 = Regex("""^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$""")

    fun isIpv4(value: String?): Boolean = value != null && IPV4.matches(value.trim())

    fun resolve(hostname: String, state: HostState): String? {
        if (!state.enabled) return null
        if (state.mappingId == "official") return null
        if (state.mappingId == "custom") {
            val ip = state.custom[hostname]?.trim().orEmpty()
            return if (isIpv4(ip)) ip else null
        }
        return HostConfig.byId(state.mappingId)?.hosts?.get(hostname)
    }
}

object HostConfig {
    var mappings: List<Mapping> = emptyList()
    var hostnames: List<String> = emptyList()
    var defaultMappingId: String = "sg"

    fun byId(id: String): Mapping? = mappings.firstOrNull { it.id == id }

    fun load(context: Context) {
        try {
            val text = context.assets.open("hosts.json").bufferedReader().use { it.readText() }
            val root = JSONObject(text)
            defaultMappingId = root.optString("defaultMappingId", "sg")
            val names = mutableListOf<String>()
            root.optJSONObject("hostnames")?.let { h ->
                val keys = h.keys()
                while (keys.hasNext()) names.add(keys.next())
            }
            hostnames = names
            val arr = root.optJSONArray("mappings") ?: JSONArray()
            val list = mutableListOf<Mapping>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val hosts = mutableMapOf<String, String>()
                o.optJSONObject("hosts")?.let { h ->
                    val keys = h.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        val v = h.optString(k, "").trim()
                        if (v.isNotEmpty()) hosts[k] = v
                    }
                }
                list.add(Mapping(o.getString("id"), o.optString("name", o.getString("id")), o.optString("short", o.getString("id")), hosts))
            }
            if (list.isNotEmpty()) mappings = list
        } catch (e: Exception) {
            // Fallback keeps the app usable even if the asset is missing.
            mappings = listOf(
                Mapping("official", "官方直连", "官方", emptyMap()),
                Mapping("sg", "亚太 · 新加坡", "新加坡", mapOf("github.com" to "20.205.243.166", "api.github.com" to "20.205.243.168")),
            )
        }
    }
}
