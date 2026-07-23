package com.shangmei.platform.aibusiness.identity;

import com.shangmei.platform.aibusiness.identity.IdentityModels.IntrospectionResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CoreIdentityVerifier implements IdentityVerifier {
    private final RestClient restClient;

    public CoreIdentityVerifier(
            RestClient.Builder builder,
            @Value("${platform.identity.core-base-url:http://127.0.0.1:8080}") String coreBaseUrl
    ) {
        this.restClient = builder.baseUrl(coreBaseUrl).build();
    }

    @Override
    public IntrospectionResponse verify(String authorization) {
        try {
            IntrospectionResponse response = restClient.post()
                    .uri("/api/v1/auth/introspect")
                    .header(HttpHeaders.AUTHORIZATION, authorization)
                    .retrieve()
                    .body(IntrospectionResponse.class);
            if (response == null || !response.active()) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录状态无效");
            }
            return response;
        } catch (HttpClientErrorException.Unauthorized exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录状态无效");
        } catch (HttpClientErrorException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "身份控制面拒绝了认证请求");
        } catch (ResourceAccessException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "身份控制面不可用");
        }
    }
}
