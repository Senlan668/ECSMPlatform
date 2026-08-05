package cn.hollis.llm.mentor.agent.utils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import java.util.regex.Pattern;

public final class TenantResourceScope {
    private static final Pattern CONVERSATION_SUFFIX = Pattern.compile("[A-Za-z0-9_-]{1,80}");

    private TenantResourceScope() {
    }

    public static String newFileId(String tenantId) {
        return prefix(tenantId) + "_" + UUID.randomUUID();
    }

    public static void requireFileAccess(String tenantId, String fileId) {
        if (!ownsFile(tenantId, fileId)) {
            throw new IllegalArgumentException("文件不存在或不属于当前租户");
        }
    }

    public static boolean ownsFile(String tenantId, String fileId) {
        return tenantId != null && !tenantId.isBlank()
                && fileId != null && fileId.startsWith(prefix(tenantId) + "_");
    }

    public static String conversationPrefix(String tenantId, String subjectId) {
        if (tenantId == null || tenantId.isBlank() || subjectId == null || subjectId.isBlank()) {
            throw new IllegalArgumentException("租户和主体上下文不能为空");
        }
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString((tenantId + "\n" + subjectId).getBytes(StandardCharsets.UTF_8));
    }

    public static void requireConversationAccess(String tenantId, String subjectId, String conversationId) {
        if (!ownsConversation(tenantId, subjectId, conversationId)) {
            throw new IllegalArgumentException("会话不存在或不属于当前主体");
        }
    }

    public static boolean ownsConversation(String tenantId, String subjectId, String conversationId) {
        if (tenantId == null || tenantId.isBlank() || subjectId == null || subjectId.isBlank() || conversationId == null) {
            return false;
        }
        String prefix = conversationPrefix(tenantId, subjectId) + ".";
        return conversationId.startsWith(prefix)
                && CONVERSATION_SUFFIX.matcher(conversationId.substring(prefix.length())).matches();
    }

    private static String prefix(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("租户上下文不能为空");
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(tenantId.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
