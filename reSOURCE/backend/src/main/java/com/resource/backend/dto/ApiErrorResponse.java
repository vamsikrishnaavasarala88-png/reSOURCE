package com.resource.backend.dto;

import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Uniform error body. Deliberately free of stack traces or internal details.
 *
 * @param errors field level validation messages, keyed by field name
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiErrorResponse(
        int status,
        String error,
        String message,
        Map<String, String> errors,
        Instant timestamp,
        String path) {

    public static ApiErrorResponse of(int status, String error, String message, String path) {
        return new ApiErrorResponse(status, error, message, null, Instant.now(), path);
    }

    public static ApiErrorResponse withFieldErrors(
            int status, String error, String message, Map<String, String> errors, String path) {
        return new ApiErrorResponse(status, error, message, errors, Instant.now(), path);
    }
}
