package com.resource.backend.ai;

/**
 * The AI provider could not answer: not configured, unreachable, too slow, or
 * it returned something that is not usable JSON.
 *
 * <p>The category is for logging only ({@code not_configured}, {@code timeout},
 * {@code network}, {@code auth}, {@code rate_limited}, {@code server_error},
 * {@code malformed_output}). It never reaches the client and never contains the
 * provider's own message, which could echo request details.</p>
 */
public class AiUnavailableException extends RuntimeException {

    private final String category;

    public AiUnavailableException(String category, String message) {
        super(message);
        this.category = category;
    }

    public AiUnavailableException(String category, String message, Throwable cause) {
        super(message, cause);
        this.category = category;
    }

    public String getCategory() {
        return category;
    }
}
