package com.shangmei.platform.core.identity;

import com.shangmei.platform.core.identity.IdentityModels.AuthPrincipal;
import com.shangmei.platform.core.identity.IdentityModels.LoginRequest;
import com.shangmei.platform.core.identity.IdentityModels.PrincipalResponse;
import com.shangmei.platform.core.identity.IdentityModels.RegisterRequest;
import com.shangmei.platform.core.identity.IdentityModels.SessionResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import static com.shangmei.platform.core.identity.SessionAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final IdentityService identityService;

    public AuthController(IdentityService identityService) {
        this.identityService = identityService;
    }

    @PostMapping("/login")
    public SessionResponse login(@Valid @RequestBody LoginRequest request) {
        return identityService.login(request.username(), request.password(), request.tenantId());
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionResponse register(@Valid @RequestBody RegisterRequest request) {
        return identityService.register(request.username(), request.password(), request.tenantName());
    }

    @GetMapping("/me")
    public PrincipalResponse me(@RequestAttribute(PRINCIPAL_ATTRIBUTE) AuthPrincipal principal) {
        return identityService.principalResponse(principal);
    }

    @PostMapping("/introspect")
    public PrincipalResponse introspect(@RequestAttribute(PRINCIPAL_ATTRIBUTE) AuthPrincipal principal) {
        return identityService.principalResponse(principal);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestAttribute(PRINCIPAL_ATTRIBUTE) AuthPrincipal principal) {
        identityService.logout(principal);
    }
}
