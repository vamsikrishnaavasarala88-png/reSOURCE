package com.resource.backend.ai.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * The answer when an AI feature cannot run.
 *
 * <p>AI is an enhancement: the client always has a manual path, which is what
 * {@code fallbackAvailable} says. The provider's own error text is never
 * forwarded - it could echo request details.</p>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AiFailureResponse(boolean success, String message, boolean fallbackAvailable) {

    public static AiFailureResponse unavailable(String message) {
        return new AiFailureResponse(false, message, true);
    }
}
