package cn.hollis.llm.mentor.agent.utils;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TenantResourceScopeTest {
    @Test
    void scopesFileIdsToTenant() {
        String fileId = TenantResourceScope.newFileId("tenant-a");

        assertThat(TenantResourceScope.ownsFile("tenant-a", fileId)).isTrue();
        assertThat(TenantResourceScope.ownsFile("tenant-b", fileId)).isFalse();
        assertThatThrownBy(() -> TenantResourceScope.requireFileAccess("tenant-b", fileId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void scopesConversationIdsToTenantAndSubject() {
        String prefix = TenantResourceScope.conversationPrefix("tenant-a", "subject-1");
        String conversationId = prefix + ".conversation-1";

        assertThat(TenantResourceScope.ownsConversation("tenant-a", "subject-1", conversationId)).isTrue();
        assertThat(TenantResourceScope.ownsConversation("tenant-b", "subject-1", conversationId)).isFalse();
        assertThat(TenantResourceScope.ownsConversation("tenant-a", "subject-2", conversationId)).isFalse();
        assertThat(TenantResourceScope.ownsConversation("tenant-a", "subject-1", prefix + ".bad.id")).isFalse();
    }
}
