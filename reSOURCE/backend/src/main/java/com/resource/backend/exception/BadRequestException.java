package com.resource.backend.exception;

import java.util.Map;

/**
 * Thrown when a request breaks a business rule that Bean Validation cannot
 * express (for example a paid activity without a price). Mapped to HTTP 400.
 *
 * <p>It can carry per-field messages as well, so a rule that is only decidable in
 * the service - such as "which fields a space request needs, depending on the
 * resource type" - still reaches the form as field level errors.</p>
 */
public class BadRequestException extends RuntimeException {

    private final transient Map<String, String> fields;

    public BadRequestException(String message) {
        this(message, Map.of());
    }

    public BadRequestException(String message, Map<String, String> fields) {
        super(message);
        this.fields = fields == null ? Map.of() : Map.copyOf(fields);
    }

    /** Field level messages, empty when the failure is not tied to one field. */
    public Map<String, String> getFields() {
        return fields;
    }
}
