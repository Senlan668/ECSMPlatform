package com.shangmei.platform.aibusiness.agent;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;

public interface AgentRuntimeGateway {
    @FunctionalInterface
    interface InputStreamSource {
        InputStream open() throws IOException;
    }

    record MultipartPart(
            String name,
            String filename,
            String contentType,
            long size,
            InputStreamSource source
    ) {
    }

    record RuntimeResponse(
            int statusCode,
            InputStream body,
            String contentType,
            Long contentLength,
            Map<String, List<String>> headers
    ) {
    }

    RuntimeResponse forward(
            String tenantId,
            String subjectId,
            String method,
            String path,
            String query,
            String contentType,
            String accept,
            byte[] body
    );

    RuntimeResponse forwardMultipart(
            String tenantId,
            String subjectId,
            String path,
            String accept,
            List<MultipartPart> parts
    );
}
