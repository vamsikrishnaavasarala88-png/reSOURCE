package com.resource.backend.ai;

/**
 * One request to the AI provider: a system instruction, the user's own text and
 * optionally a single image.
 *
 * <p>Only what the operation needs is ever put in here. No password, no token,
 * no contact details and no profile data may be added to a prompt - see the
 * privacy rule in the phase brief.</p>
 *
 * @param system    system instruction describing the JSON to produce
 * @param user      the user's query, listing description or confirmed facts
 * @param image     image bytes plus MIME type, or {@code null} for a text-only call
 * @param timeoutMs how long this one call may take, or {@code null} for the
 *                  configured default
 */
public record AiPrompt(String system, String user, AiImage image, Integer timeoutMs) {

    public static AiPrompt text(String system, String user) {
        return new AiPrompt(system, user, null, null);
    }

    public static AiPrompt withImage(String system, String user, byte[] bytes, String mimeType) {
        return new AiPrompt(system, user, new AiImage(bytes, mimeType), null);
    }

    /**
     * A call a visitor is sitting in front of, waiting.
     *
     * <p>A search that has not answered within its short budget is not going to
     * feel fast when it finally does, and the visitor has working filters to fall
     * back on. Failing early is the better answer; the ending is the same either
     * way, because every AI path has a manual one.</p>
     */
    public static AiPrompt search(String system, String user, int timeoutMs) {
        return new AiPrompt(system, user, null, timeoutMs);
    }

    /** An image already validated and downscaled by {@code AiImageValidator}. */
    public record AiImage(byte[] bytes, String mimeType) {
    }
}
