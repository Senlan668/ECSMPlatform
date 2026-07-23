package com.shangmei.platform.aibusiness.identity;

import com.shangmei.platform.aibusiness.identity.IdentityModels.IntrospectionResponse;

public interface IdentityVerifier {
    IntrospectionResponse verify(String authorization);
}
