package com.resource.backend.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings for the AI intelligence layer, bound from {@code app.ai.*}.
 *
 * <p>The API key has no default: it is supplied through {@code AI_API_KEY} (see
 * {@code backend/.env.example}) and never committed. When it is missing every AI
 * feature reports itself as unavailable instead of failing, and the marketplaces
 * keep working exactly as before - the normal filters are never taken away.</p>
 *
 * @param apiKey                   provider key; empty means "AI is not configured"
 * @param baseUrl                  OpenAI-compatible base URL, e.g. {@code https://api.openai.com/v1}
 * @param model                    model name, must support JSON output and vision for phase 6
 * @param connectTimeoutMs         TCP connect timeout
 * @param readTimeoutMs            whole-request timeout; an AI call may never hang the backend
 * @param maxImageBytes            largest image accepted for recognition
 * @param maxImageDimension        largest accepted pixel edge before an image is refused
 * @param maxImageEdge             edge images are downscaled to before being sent to the provider
 * @param searchQueryMaxLength     longest accepted natural-language search text
 * @param extractionTextMaxLength  longest accepted listing description text
 * @param descriptionMaxLength     longest AI-generated description that is kept
 * @param confidenceHigh           confidence at or above this is "High confidence"
 * @param confidenceMedium         confidence at or above this is "Possible match"
 * @param searchRequestsPerMinute  search-intent calls allowed per client per minute
 * @param listingRequestsPerMinute AI calls allowed per signed-in user per minute
 * @param cacheTtlSeconds          how long an extracted search intent is reused
 * @param cacheMaxEntries          size cap of that cache
 */
@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(
        String apiKey,
        String baseUrl,
        String model,
        int connectTimeoutMs,
        int readTimeoutMs,
        int searchReadTimeoutMs,
        long maxImageBytes,
        int maxImageDimension,
        int maxImageEdge,
        int searchQueryMaxLength,
        int extractionTextMaxLength,
        int descriptionMaxLength,
        double confidenceHigh,
        double confidenceMedium,
        int searchRequestsPerMinute,
        int listingRequestsPerMinute,
        int cacheTtlSeconds,
        int cacheMaxEntries) {

    public AiProperties {
        baseUrl = (baseUrl == null || baseUrl.isBlank()) ? "https://api.openai.com/v1" : baseUrl.trim();
        // Trailing slash would produce "//chat/completions" later on.
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }
        model = (model == null || model.isBlank()) ? "gpt-4o-mini" : model.trim();
        connectTimeoutMs = connectTimeoutMs <= 0 ? 3000 : connectTimeoutMs;
        readTimeoutMs = readTimeoutMs <= 0 ? 20000 : readTimeoutMs;
        searchReadTimeoutMs = searchReadTimeoutMs <= 0 ? 8000 : searchReadTimeoutMs;
        maxImageBytes = maxImageBytes <= 0 ? 4L * 1024 * 1024 : maxImageBytes;
        maxImageDimension = maxImageDimension <= 0 ? 8000 : maxImageDimension;
        maxImageEdge = maxImageEdge <= 0 ? 1024 : maxImageEdge;
        searchQueryMaxLength = searchQueryMaxLength <= 0 ? 300 : searchQueryMaxLength;
        extractionTextMaxLength = extractionTextMaxLength <= 0 ? 1000 : extractionTextMaxLength;
        descriptionMaxLength = descriptionMaxLength <= 0 ? 1200 : descriptionMaxLength;
        confidenceHigh = confidenceHigh <= 0 ? 0.80 : confidenceHigh;
        confidenceMedium = confidenceMedium <= 0 ? 0.50 : confidenceMedium;
        searchRequestsPerMinute = searchRequestsPerMinute <= 0 ? 20 : searchRequestsPerMinute;
        listingRequestsPerMinute = listingRequestsPerMinute <= 0 ? 30 : listingRequestsPerMinute;
        cacheTtlSeconds = cacheTtlSeconds < 0 ? 300 : cacheTtlSeconds;
        cacheMaxEntries = cacheMaxEntries <= 0 ? 200 : cacheMaxEntries;
    }

    /** True when a provider key is present; nothing AI is attempted without one. */
    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
