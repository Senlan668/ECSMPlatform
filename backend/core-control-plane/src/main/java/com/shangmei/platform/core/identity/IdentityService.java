package com.shangmei.platform.core.identity;

import com.shangmei.platform.core.identity.IdentityModels.AuthPrincipal;
import com.shangmei.platform.core.identity.IdentityModels.Member;
import com.shangmei.platform.core.identity.IdentityModels.PrincipalResponse;
import com.shangmei.platform.core.identity.IdentityModels.SessionResponse;
import com.shangmei.platform.core.identity.IdentityModels.Tenant;
import com.shangmei.platform.core.identity.IdentityModels.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class IdentityService {
    private record Account(String passwordHash, User user, Set<String> tenantIds) {
    }

    private record Session(String token, Instant expiresAt, User user, List<String> tenantIds, String activeTenantId) {
    }

    private final Map<String, Account> accounts = new ConcurrentHashMap<>();
    private final Map<String, Tenant> tenants = new ConcurrentHashMap<>();
    private final Map<String, List<Member>> membersByTenant = new ConcurrentHashMap<>();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder(10);
    private final SecureRandom secureRandom = new SecureRandom();
    private final Duration sessionTtl;

    public IdentityService(@Value("${platform.auth.session-ttl:PT8H}") Duration sessionTtl) {
        this.sessionTtl = sessionTtl;
        seedDevelopmentIdentity();
    }

    public SessionResponse login(String username, String password, String requestedTenantId) {
        String normalized = normalizeUsername(username);
        Account account = accounts.get(normalized);
        if (account == null || !passwordEncoder.matches(password, account.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "账号或密码不正确");
        }

        String activeTenantId = selectTenant(account, requestedTenantId);
        return issueSession(account, activeTenantId);
    }

    public SessionResponse register(String username, String password, String tenantName) {
        String normalized = normalizeUsername(username);
        String normalizedTenantName = tenantName.trim();
        if (normalizedTenantName.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "租户名称不能为空");
        }

        String tenantId = "tenant:" + UUID.randomUUID();
        User user = new User("user:" + UUID.randomUUID(), normalized, normalized);
        Account account = new Account(passwordEncoder.encode(password), user, Set.of(tenantId));
        if (accounts.putIfAbsent(normalized, account) != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该账号已被注册");
        }

        Tenant tenant = new Tenant(tenantId, normalizedTenantName, "MVP");
        tenants.put(tenantId, tenant);
        membersByTenant.put(tenantId, List.of(new Member(user.id(), user.username(), user.name(), "owner")));
        return issueSession(account, tenantId);
    }

    public AuthPrincipal authenticate(String authorization) {
        String token = bearerToken(authorization);
        Session session = sessions.get(token);
        if (session == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录状态无效");
        }
        if (!session.expiresAt().isAfter(Instant.now())) {
            sessions.remove(token);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "登录状态已过期");
        }
        return new AuthPrincipal(
                session.token(), session.expiresAt(), session.user(), session.tenantIds(), session.activeTenantId()
        );
    }

    public void logout(AuthPrincipal principal) {
        sessions.remove(principal.token());
    }

    public PrincipalResponse principalResponse(AuthPrincipal principal) {
        return new PrincipalResponse(
                true,
                principal.expiresAt(),
                principal.user(),
                tenantDetails(principal.tenantIds()),
                principal.activeTenantId()
        );
    }

    public List<Tenant> tenantDetails(AuthPrincipal principal) {
        return tenantDetails(principal.tenantIds());
    }

    public List<Member> members(AuthPrincipal principal, String tenantId) {
        requireTenant(principal, tenantId);
        return membersByTenant.getOrDefault(tenantId, List.of());
    }

    public void requireTenant(AuthPrincipal principal, String tenantId) {
        if (!principal.canAccess(tenantId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "租户不存在或无权访问");
        }
    }

    private SessionResponse issueSession(Account account, String activeTenantId) {
        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        Instant expiresAt = Instant.now().plus(sessionTtl);
        List<String> tenantIds = List.copyOf(account.tenantIds());
        Session session = new Session(token, expiresAt, account.user(), tenantIds, activeTenantId);
        sessions.put(token, session);
        return new SessionResponse(
                token,
                "Bearer",
                expiresAt,
                account.user(),
                tenantDetails(tenantIds),
                activeTenantId
        );
    }

    private String selectTenant(Account account, String requestedTenantId) {
        if (requestedTenantId == null || requestedTenantId.isBlank()) {
            return account.tenantIds().iterator().next();
        }
        if (!account.tenantIds().contains(requestedTenantId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "租户不存在或无权访问");
        }
        return requestedTenantId;
    }

    private List<Tenant> tenantDetails(List<String> tenantIds) {
        List<Tenant> result = new ArrayList<>();
        for (String tenantId : tenantIds) {
            Tenant tenant = tenants.get(tenantId);
            if (tenant != null) {
                result.add(tenant);
            }
        }
        return List.copyOf(result);
    }

    private String normalizeUsername(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private String bearerToken(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "缺少访问令牌");
        }
        String token = authorization.substring(7).trim();
        if (token.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "缺少访问令牌");
        }
        return token;
    }

    private void seedDevelopmentIdentity() {
        Tenant commerce = new Tenant("senlan-commerce", "森蓝电商", "专业版");
        Tenant media = new Tenant("senlan-media", "森蓝内容矩阵", "专业版");
        tenants.put(commerce.id(), commerce);
        tenants.put(media.id(), media);

        User admin = new User("user:admin", "管理员", "admin");
        Set<String> tenantIds = new LinkedHashSet<>(List.of(commerce.id(), media.id()));
        accounts.put("admin", new Account(passwordEncoder.encode("123"), admin, Set.copyOf(tenantIds)));
        Member member = new Member(admin.id(), admin.username(), admin.name(), "owner");
        membersByTenant.put(commerce.id(), List.of(member));
        membersByTenant.put(media.id(), List.of(member));
    }
}
