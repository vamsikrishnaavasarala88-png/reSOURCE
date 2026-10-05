package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.resource.backend.ai.AiPrompt;
import com.resource.backend.ai.AiProperties;
import com.resource.backend.ai.AiUnavailableException;
import com.resource.backend.ai.OpenAiProviderService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The provider client against a real HTTP server on localhost.
 *
 * <p>This is the one place the wire format is checked: the request that goes
 * out, the answer that is read back, and how each kind of failure becomes a
 * category the rest of the application can act on. The key is asserted to be in
 * the Authorization header and nowhere else.</p>
 */
class OpenAiProviderServiceTest {

    private static final String KEY = "sk-test-key-that-must-never-be-logged";

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private final AtomicReference<String> lastAuthorization = new AtomicReference<>();
    private final AtomicInteger requests = new AtomicInteger();

    private volatile String answer = "{}";
    private volatile int statusCode = 200;
    private volatile long delayMs = 0;
    private int readTimeoutMs = 2000;
    private int searchTimeoutMs = 1000;

    private HttpServer server;
    private String baseUrl;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", this::handle);
        server.start();

        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    // ---------------------------------------------------------------- success

    @Test
    void asksForJsonAndSendsTheKeyAsABearerToken() throws Exception {
        answerWith(200, """
                {"choices":[{"message":{"role":"assistant","content":"{\\"category\\":\\"BRICKS\\"}"}}]}
                """);

        String content = provider().completeJson(AiPrompt.text("system text", "user text"));

        assertThat(content).isEqualTo("{\"category\":\"BRICKS\"}");

        JsonNode sent = objectMapper.readTree(lastBody.get());

        assertThat(sent.get("model").asString()).isEqualTo("test-model");
        assertThat(sent.get("temperature").asDouble()).isZero();
        assertThat(sent.get("response_format").get("type").asString()).isEqualTo("json_object");
        assertThat(sent.get("messages").get(0).get("role").asString()).isEqualTo("system");
        assertThat(sent.get("messages").get(0).get("content").asString()).isEqualTo("system text");
        assertThat(sent.get("messages").get(1).get("content").asString()).isEqualTo("user text");

        assertThat(lastAuthorization.get()).isEqualTo("Bearer " + KEY);
        assertThat(lastBody.get()).doesNotContain(KEY);
    }

    @Test
    void sendsAnImageAsADataUrl() throws Exception {
        answerWith(200, """
                {"choices":[{"message":{"content":"{}"}}]}
                """);

        byte[] image = new byte[] {1, 2, 3, 4, 5};

        provider().completeJson(AiPrompt.withImage("system", "what is this?", image, "image/jpeg"));

        JsonNode parts = objectMapper.readTree(lastBody.get()).get("messages").get(1).get("content");

        assertThat(parts.get(0).get("text").asString()).isEqualTo("what is this?");
        assertThat(parts.get(1).get("type").asString()).isEqualTo("image_url");
        assertThat(parts.get(1).get("image_url").get("url").asString())
                .isEqualTo("data:image/jpeg;base64," + Base64.getEncoder().encodeToString(image));
    }

    @Test
    void readsAnAnswerSplitIntoContentParts() {
        answerWith(200, """
                {"choices":[{"message":{"content":[{"type":"text","text":"{\\"a\\":"},{"type":"text","text":"1}"}]}}]}
                """);

        assertThat(provider().completeJson(AiPrompt.text("s", "u"))).isEqualTo("{\"a\":1}");
    }

    // --------------------------------------------------------------- failures

    @Test
    void reportsAnUnauthorisedKeyAsAnAuthFailure() {
        answerWith(401, """
                {"error":{"message":"Incorrect API key provided: sk-test"}}
                """);

        assertThat(categoryOfCall()).isEqualTo("auth");
    }

    @Test
    void reportsProviderStatusesByCategory() {
        assertThat(categoryFor(429, "{}")).isEqualTo("rate_limited");
        assertThat(categoryFor(500, "{}")).isEqualTo("server_error");
        assertThat(categoryFor(404, "{}")).isEqualTo("client_error");
    }

    @Test
    void reportsASlowProviderAsATimeout() {
        readTimeoutMs = 250;
        answerWith(200, """
                {"choices":[{"message":{"content":"{}"}}]}
                """, 900);

        assertThat(categoryOfCall()).isEqualTo("timeout");
    }

    @Test
    void aSearchFailsOnItsOwnShorterBudget() {
        // Someone is waiting on a search, so it gives up long before a call that
        // nobody is blocked on - but only the search: the general call still waits.
        readTimeoutMs = 2000;
        searchTimeoutMs = 250;
        answerWith(200, """
                {"choices":[{"message":{"content":"{}"}}]}
                """, 900);

        Runnable search = () -> provider()
                .completeJson(AiPrompt.search("s", "u", searchTimeoutMs));

        assertThat(categoryOf(search)).isEqualTo("timeout");
    }

    @Test
    void reportsUnusableAnswersAsMalformedOutput() {
        assertThat(categoryFor(200, "this is not json at all")).isEqualTo("malformed_output");
        assertThat(categoryFor(200, "{}")).isEqualTo("malformed_output");
        assertThat(categoryFor(200, """
                {"choices":[{"message":{"content":""}}]}
                """)).isEqualTo("malformed_output");
    }

    @Test
    void neverCallsOutWithoutAKey() {
        Runnable call = () -> new OpenAiProviderService(properties(null, baseUrl), objectMapper)
                .completeJson(AiPrompt.text("s", "u"));

        assertThat(categoryOf(call)).isEqualTo("not_configured");
        assertThat(requests.get()).isZero();
    }

    @Test
    void reportsAnEndpointThatIsNotThereAtAll() {
        Runnable call = () -> new OpenAiProviderService(
                properties(KEY, "http://127.0.0.1:1/v1"), objectMapper)
                .completeJson(AiPrompt.text("s", "u"));

        assertThat(categoryOf(call)).isEqualTo("network");
    }

    // ---------------------------------------------------------------- helpers

    private String categoryOfCall() {
        return categoryOf(() -> provider().completeJson(AiPrompt.text("s", "u")));
    }

    private String categoryFor(int status, String body) {
        answerWith(status, body);

        return categoryOfCall();
    }

    private static String categoryOf(Runnable call) {
        Throwable failure = catchThrowable(call::run);

        assertThat(failure).isInstanceOf(AiUnavailableException.class);

        return ((AiUnavailableException) failure).getCategory();
    }

    private OpenAiProviderService provider() {
        return new OpenAiProviderService(properties(KEY, baseUrl), objectMapper);
    }

    private AiProperties properties(String key, String url) {
        return new AiProperties(key, url, "test-model", 1000, readTimeoutMs, searchTimeoutMs,
                1_000_000, 8000, 1024, 300, 1000, 1200, 0.8, 0.5, 20, 30, 300, 200);
    }

    private void answerWith(int status, String body) {
        answerWith(status, body, 0);
    }

    private void answerWith(int status, String body, long delay) {
        answer = body;
        statusCode = status;
        delayMs = delay;
    }

    /** The local stand-in for the provider: it records the request and answers with the test body. */
    private void handle(HttpExchange exchange) throws IOException {
        requests.incrementAndGet();
        lastAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
        lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));

        if (delayMs > 0) {
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            }
        }

        byte[] response = answer.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, response.length);

        try (OutputStream output = exchange.getResponseBody()) {
            output.write(response);
        }
    }
}
