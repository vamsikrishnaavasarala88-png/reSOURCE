package com.resource.backend.ai;

/**
 * The one place the application talks to an AI provider.
 *
 * <p>Everything else in the codebase depends on this interface, never on a
 * vendor SDK or a HTTP shape, so the provider stays configurable (OpenAI today,
 * any OpenAI-compatible gateway or a different implementation tomorrow) and the
 * tests can drive the whole layer without a network call.</p>
 */
public interface AiProvider {

    /**
     * Runs one chat completion that must answer with a JSON object.
     *
     * @param prompt system + user text, optionally with one image
     * @return the raw JSON text the provider returned, still unvalidated
     * @throws AiUnavailableException when the provider is missing, unreachable,
     *                                too slow or answered with something unusable
     */
    String completeJson(AiPrompt prompt);

    /** True when the provider has everything it needs (an API key) to run. */
    boolean isConfigured();
}
