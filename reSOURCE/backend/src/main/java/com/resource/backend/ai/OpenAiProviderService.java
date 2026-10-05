package com.resource.backend.ai;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The provider client: one OpenAI-compatible chat-completions call, nothing else.
 *
 * <p>This is the only class in the application that knows a provider's HTTP
 * shape. It asks for JSON output, keeps a strict timeout so a slow provider can
 * never hang a request thread, and turns every failure into an
 * {@link AiUnavailableException} with a log-only category.</p>
 *
 * <p>What is logged: the operation, whether it worked, how long it took and the
 * error category. What is never logged: the API key, prompts, images or any
 * user data.</p>
 */
@Service
public class OpenAiProviderService implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(OpenAiProviderService.class);

    private final AiProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public OpenAiProviderService(AiProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.connectTimeoutMs()))
                .build();
    }

    @Override
    public boolean isConfigured() {
        return properties.configured();
    }

    /**
     * How long this call may take: the prompt's own budget when it has one, so a
     * search the visitor is waiting on fails early, otherwise the configured
     * default for the calls a person is not blocking on.
     */
    private long budgetMillis(AiPrompt prompt) {
        Integer budget = prompt == null ? null : prompt.timeoutMs();

        return budget != null && budget > 0 ? budget : properties.readTimeoutMs();
    }

    @Override
    public String completeJson(AiPrompt prompt) {
        if (!isConfigured()) {
            throw new AiUnavailableException("not_configured",
                    "The AI provider is not configured.");
        }

        long startedAt = System.nanoTime();
        String operation = prompt.image() == null ? "text" : "vision";

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(properties.baseUrl() + "/chat/completions"))
                    .timeout(Duration.ofMillis(budgetMillis(prompt)))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + properties.apiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(
                            objectMapper.writeValueAsString(requestBody(prompt))))
                    .build();

            HttpResponse<String> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() / 100 != 2) {
                throw new AiUnavailableException(statusCategory(response.statusCode()),
                        "The AI provider answered with status " + response.statusCode() + ".");
            }

            String content = extractContent(response.body());

            log.info("AI {} call finished in {} ms", operation, elapsedMillis(startedAt));

            return content;
        } catch (HttpTimeoutException exception) {
            log.warn("AI {} call timed out after {} ms", operation, elapsedMillis(startedAt));
            throw new AiUnavailableException("timeout", "The AI provider took too long to answer.", exception);
        } catch (IOException exception) {
            log.warn("AI {} call failed after {} ms ({})", operation, elapsedMillis(startedAt),
                    exception.getClass().getSimpleName());
            throw new AiUnavailableException("network", "The AI provider could not be reached.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiUnavailableException("network", "The AI call was interrupted.", exception);
        } catch (AiUnavailableException exception) {
            log.warn("AI {} call failed after {} ms (category={})", operation,
                    elapsedMillis(startedAt), exception.getCategory());
            throw exception;
        }
    }

    // --------------------------------------------------------------- internals

    private Map<String, Object> requestBody(AiPrompt prompt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", properties.model());
        // Facts must come from the user, not from sampling.
        body.put("temperature", 0);
        body.put("response_format", Map.of("type", "json_object"));
        body.put("messages", List.of(
                Map.of("role", "system", "content", prompt.system()),
                Map.of("role", "user", "content", userContent(prompt))));

        return body;
    }

    /** Plain text for text calls, or a text + image pair for a multimodal call. */
    private Object userContent(AiPrompt prompt) {
        if (prompt.image() == null) {
            return prompt.user();
        }

        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("type", "text", "text", prompt.user()));
        parts.add(Map.of(
                "type", "image_url",
                "image_url", Map.of("url", "data:" + prompt.image().mimeType() + ";base64,"
                        + Base64.getEncoder().encodeToString(prompt.image().bytes()))));

        return parts;
    }

    /** Pulls the assistant message out of a chat-completions response. */
    private String extractContent(String responseBody) {
        JsonNode root;

        try {
            root = objectMapper.readTree(responseBody);
        } catch (RuntimeException exception) {
            throw new AiUnavailableException("malformed_output",
                    "The AI provider returned a body that is not JSON.", exception);
        }

        JsonNode choices = root == null ? null : root.get("choices");

        if (choices == null || !choices.isArray() || choices.isEmpty()) {
            throw new AiUnavailableException("malformed_output",
                    "The AI provider returned no choices.");
        }

        JsonNode message = choices.get(0).get("message");
        JsonNode content = message == null ? null : message.get("content");

        if (content == null || content.isNull()) {
            throw new AiUnavailableException("malformed_output",
                    "The AI provider returned an empty message.");
        }

        // Providers either send a plain string or a list of content parts.
        if (content.isString() && !content.asString().isBlank()) {
            return content.asString();
        }

        if (content.isArray()) {
            StringBuilder joined = new StringBuilder();

            for (JsonNode part : content) {
                JsonNode text = part.get("text");

                if (text != null && text.isString()) {
                    joined.append(text.asString());
                }
            }

            if (!joined.toString().isBlank()) {
                return joined.toString();
            }
        }

        // Empty or non-text: an answer no operation can do anything with.
        throw new AiUnavailableException("malformed_output",
                "The AI provider returned a message that is not text.");
    }

    private String statusCategory(int statusCode) {
        if (statusCode == 401 || statusCode == 403) {
            return "auth";
        }

        if (statusCode == 429) {
            return "rate_limited";
        }

        return statusCode >= 500 ? "server_error" : "client_error";
    }

    private static long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
