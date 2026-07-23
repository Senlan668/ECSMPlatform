package com.shangmei.platform.aibusiness.campaign;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;

public interface ContentCampaignRuntimeGateway {
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
            String contentDisposition,
            Long contentLength,
            Map<String, List<String>> headers
    ) {
    }

    RuntimeResponse forward(
            String tenantId,
            String subjectId,
            String subjectUsername,
            String subjectName,
            String traceId,
            String method,
            String path,
            String query,
            String contentType,
            String accept,
            String range,
            byte[] body
    );

    RuntimeResponse forwardMultipart(
            String tenantId,
            String subjectId,
            String subjectUsername,
            String subjectName,
            String traceId,
            String method,
            String path,
            String query,
            String accept,
            List<MultipartPart> parts
    );
}
