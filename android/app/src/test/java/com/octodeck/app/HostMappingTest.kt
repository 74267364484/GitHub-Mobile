package com.octodeck.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HostMappingTest {

    @Before
    fun setUp() {
        HostConfig.defaultMappingId = "sg"
        HostConfig.hostnames = listOf("github.com", "api.github.com", "raw.githubusercontent.com")
        HostConfig.mappings = listOf(
            Mapping("official", "官方直连", "官方", emptyMap()),
            Mapping(
                "sg", "亚太 · 新加坡", "新加坡",
                mapOf(
                    "github.com" to "20.205.243.166",
                    "api.github.com" to "20.205.243.168",
                    "raw.githubusercontent.com" to "185.199.108.133",
                ),
            ),
            Mapping("custom", "自定义 Hosts", "自定义", emptyMap()),
        )
    }

    @Test
    fun officialUsesSystemDns() {
        assertNull(HostResolver.resolve("github.com", HostState(enabled = true, mappingId = "official")))
    }

    @Test
    fun disabledMappingUsesSystemDns() {
        assertNull(HostResolver.resolve("github.com", HostState(enabled = false, mappingId = "sg")))
    }

    @Test
    fun resolvesSingaporeEdges() {
        val state = HostState(enabled = true, mappingId = "sg")
        assertEquals("20.205.243.166", HostResolver.resolve("github.com", state))
        assertEquals("20.205.243.168", HostResolver.resolve("api.github.com", state))
        assertEquals("185.199.108.133", HostResolver.resolve("raw.githubusercontent.com", state))
        assertNull(HostResolver.resolve("avatars.githubusercontent.com", state))
    }

    @Test
    fun customIpIsUsed() {
        val state = HostState(
            enabled = true,
            mappingId = "custom",
            custom = mapOf("github.com" to "140.82.112.3", "api.github.com" to "140.82.112.6"),
        )
        assertEquals("140.82.112.3", HostResolver.resolve("github.com", state))
        assertEquals("140.82.112.6", HostResolver.resolve("api.github.com", state))
        assertNull(HostResolver.resolve("raw.githubusercontent.com", state))
    }

    @Test
    fun invalidCustomIpIsRejected() {
        val state = HostState(enabled = true, mappingId = "custom", custom = mapOf("github.com" to "not-an-ip"))
        assertNull(HostResolver.resolve("github.com", state))
        assertFalse(HostResolver.isIpv4("999.1.1.1"))
        assertFalse(HostResolver.isIpv4("20.205.243"))
        assertTrue(HostResolver.isIpv4("20.205.243.166"))
    }

    @Test
    fun parsesPersistedHostState() {
        val json = JSONObject(
            """{"enabled":false,"mappingId":"jp","custom":{"github.com":"20.27.177.113"}}""",
        )
        val state = HostState.fromJson(json)
        assertFalse(state.enabled)
        assertEquals("jp", state.mappingId)
        assertEquals("20.27.177.113", state.custom["github.com"])
    }

    @Test
    fun fallsBackToDefaultsForBrokenState() {
        val state = HostState.fromJson("{not-json", HostState(mappingId = "sg"))
        assertTrue(state.enabled)
        assertEquals("sg", state.mappingId)
    }
}
