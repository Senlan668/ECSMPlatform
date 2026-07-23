package com.shangmei.platform.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class IdentityApiTest {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void seededAdminCanLoginWithoutEmail() throws Exception {
        String body = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"admin","password":"123","tenantId":"senlan-commerce"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.username").value("admin"))
                .andExpect(jsonPath("$.activeTenantId").value("senlan-commerce"))
                .andExpect(jsonPath("$.tenants.length()").value(2))
                .andReturn().getResponse().getContentAsString();

        JsonNode response = objectMapper.readTree(body);
        assertThat(response.path("accessToken").asText()).hasSizeGreaterThanOrEqualTo(40);
    }

    @Test
    void protectedEndpointRejectsMissingToken() throws Exception {
        mockMvc.perform(get("/api/v1/tenants"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void registrationCreatesAnIsolatedTenant() throws Exception {
        String username = "user" + System.nanoTime();
        String body = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"123","tenantName":"测试租户"}
                                """.formatted(username)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tenants.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        JsonNode response = objectMapper.readTree(body);
        String token = response.path("accessToken").asText();
        String tenantId = response.path("activeTenantId").asText();

        mockMvc.perform(get("/api/v1/tenants/{tenantId}/members", tenantId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value(username));

        mockMvc.perform(get("/api/v1/tenants/senlan-commerce/members")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void logoutRevokesTheToken() throws Exception {
        String body = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(body).path("accessToken").asText();

        mockMvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }
}
