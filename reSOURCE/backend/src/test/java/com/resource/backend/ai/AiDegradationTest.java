package com.resource.backend.ai;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.resource.backend.repository.UserRepository;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The drop-in-deployment case: an instance with no {@code AI_API_KEY}.
 *
 * <p>Nothing may break. Search keeps its own results and explains itself, every
 * other AI feature points at its manual path, and the marketplaces answer
 * exactly as they did before Phase 6.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:ai-degradation;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=integration-test-secret-long-enough-for-hs256-signing",
        "app.seed.enabled=false",
        "spring.flyway.locations=classpath:db/migration",
        "app.ai.api-key=",
        "app.ai.base-url=http://127.0.0.1:9/v1",
        "app.ai.model=unconfigured-model",
        "app.ai.listing-requests-per-minute=5"
})
@AutoConfigureMockMvc
class AiDegradationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    private String token;

    @BeforeEach
    void signIn() throws Exception {
        userRepository.deleteAll();
        token = registerAndLogin("offline." + System.nanoTime() + "@example.com");
    }

    @Test
    @DisplayName("an unconfigured instance still searches, and says the filters are there")
    void searchIntentFallsBackToFilters() throws Exception {
        String body = mockMvc.perform(post("/api/ai/search-intent")
                        .header("X-Forwarded-For", clientAddress())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"searchQuery":"a hall for a blood donation camp","resourceType":"SPACE"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.fallbackAvailable").value(true))
                .andExpect(jsonPath("$.message").value(AIController.SEARCH_UNAVAILABLE))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);

        // A failed search answers with a message only: no listings and no
        // intent, so the page goes on showing its own results.
        JsonNode json = objectMapper.readTree(body);
        assertThat("a degraded search sends no listings", json.has("results"), is(false));
        assertThat("a degraded search sends no criteria chips", json.has("chips"), is(false));
    }

    @Test
    @DisplayName("recognition points at the category dropdown")
    void recognitionFallsBackToTheCategoryDropdown() throws Exception {
        mockMvc.perform(multipart("/api/ai/material-recognition")
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(64, 64)))
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.fallbackAvailable").value(true))
                .andExpect(jsonPath("$.message").value(AIController.RECOGNITION_UNAVAILABLE));
    }

    @Test
    @DisplayName("extraction points at manual entry")
    void extractionFallsBackToManualEntry() throws Exception {
        mockMvc.perform(post("/api/ai/listing-extraction")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"300 bricks, free, near the market"}"""))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(AIController.EXTRACTION_UNAVAILABLE));
    }

    @Test
    @DisplayName("description writing points at the manual description")
    void descriptionFallsBackToWritingItManually() throws Exception {
        mockMvc.perform(post("/api/ai/generate-description")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red clay bricks","category":"BRICKS","quantity":300}"""))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(AIController.DESCRIPTION_UNAVAILABLE));
    }

    @Test
    @DisplayName("both marketplaces answer exactly as before Phase 6")
    void theMarketplacesAreUnaffected() throws Exception {
        mockMvc.perform(get("/api/spaces").param("size", "5"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/materials").param("size", "5"))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ helpers

    private String registerAndLogin(String email) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Offline Owner","email":"%s","phone":"+91 90000 12345","password":"StrongPass123"}"""
                                .formatted(email)))
                .andExpect(status().isCreated());

        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"StrongPass123"}""".formatted(email)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return objectMapper.readTree(response).get("accessToken").asString();
    }

    private static String clientAddress() {
        return "198.51.100." + new Random().nextInt(1, 250);
    }

    private static byte[] jpeg(int width, int height) {
        try {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D graphics = image.createGraphics();
            graphics.setPaint(new Color(180, 140, 120));
            graphics.fillRect(0, 0, width, height);
            graphics.dispose();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "jpeg", out);
            return out.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
