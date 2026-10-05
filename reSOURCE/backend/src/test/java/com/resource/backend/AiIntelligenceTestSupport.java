package com.resource.backend;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.resource.backend.ai.AiPrompt;
import com.resource.backend.ai.AiProvider;
import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;
import com.resource.backend.entity.User;
import com.resource.backend.repository.BookingRepository;
import com.resource.backend.repository.MaterialRepository;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.SpaceRequestRepository;
import com.resource.backend.repository.UserRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Shared setup for the Phase 6 AI tests.
 *
 * <p>The provider is the only thing replaced: {@link AiProvider} is a mock, so
 * the whole layer above it - prompts, parsing, validation, filtering, error
 * handling, the endpoints and their security - runs exactly as it does in
 * production, without a network call and without an API key.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:ai-intelligence-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=integration-test-secret-long-enough-for-hs256-signing",
        "app.jwt.expiration-minutes=60",
        "app.seed.enabled=false",
        "spring.flyway.locations=classpath:db/migration",
        // The AI settings under test: a configured provider with small, cheap limits.
        "app.ai.api-key=test-key",
        "app.ai.base-url=http://127.0.0.1:9/v1",
        "app.ai.model=test-model",
        "app.ai.max-image-bytes=65536",
        "app.ai.max-image-edge=64",
        "app.ai.description-max-length=200",
        "app.ai.search-requests-per-minute=20",
        "app.ai.listing-requests-per-minute=5",
        "app.ai.cache-ttl-seconds=300"
})
@AutoConfigureMockMvc
abstract class AiIntelligenceTestSupport {

    static final BigDecimal BHIMAVARAM_LATITUDE = new BigDecimal("16.544900");
    static final BigDecimal BHIMAVARAM_LONGITUDE = new BigDecimal("81.521200");

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected SpaceRepository spaceRepository;

    @Autowired
    protected MaterialRepository materialRepository;

    @Autowired
    protected SpaceRequestRepository requestRepository;

    @Autowired
    protected BookingRepository bookingRepository;

    /** The provider is the one seam that is mocked; everything else is the real thing. */
    @MockitoBean
    protected AiProvider aiProvider;

    protected String token;

    @BeforeEach
    void resetState() throws Exception {
        bookingRepository.deleteAll();
        requestRepository.deleteAll();
        materialRepository.deleteAll();
        spaceRepository.deleteAll();
        userRepository.deleteAll();

        // A configured provider is the normal case; tests that need it absent say so.
        when(aiProvider.isConfigured()).thenReturn(true);

        token = registerAndLogin("ai.tester@example.com", "AI Tester");
    }

    // --------------------------------------------------------------- fixtures

    /** Makes the mocked provider answer with this text for any prompt. */
    protected void providerAnswers(String answer) {
        when(aiProvider.completeJson(any(AiPrompt.class))).thenReturn(answer);
    }

    protected String registerAndLogin(String email, String name) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","email":"%s","phone":"+91 90000 00000","password":"StrongPass123"}
                                """.formatted(name, email)))
                .andExpect(status().isCreated());

        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"StrongPass123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        return node(response).get("accessToken").asString();
    }

    protected User owner() {
        return userRepository.findByEmailIgnoreCase("ai.tester@example.com").orElseThrow();
    }

    /** A space owned by the signed-in user, seeded straight into the database. */
    protected Space seedSpace(String title, ActivityType activity, BigDecimal price, boolean free,
            int capacity, double latitude, double longitude) {

        return seedSpaceWith(title, activity, price, free, capacity, "1000",
                Set.of(Facility.PARKING, Facility.WATER), latitude, longitude);
    }

    /**
     * The same, with the facilities and the size under the test's control - a
     * search for "with parking" is only meaningful when a space without parking
     * exists to be left out.
     */
    protected Space seedSpaceWith(String title, ActivityType activity, BigDecimal price, boolean free,
            int capacity, String areaSqft, Set<Facility> facilities, double latitude, double longitude) {

        Space space = new Space(owner(), title, "Seeded for the AI tests.", "Bhimavaram, Andhra Pradesh");
        space.setLatitude(BigDecimal.valueOf(latitude));
        space.setLongitude(BigDecimal.valueOf(longitude));
        space.setArea(new BigDecimal(areaSqft), AreaUnit.SQ_FT);
        space.setCapacity(capacity);
        space.setStatus(SpaceStatus.ACTIVE);
        space.replaceFacilities(new LinkedHashSet<>(facilities));
        space.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(activity, price, free, null))));

        return spaceRepository.save(space);
    }

    /** A material listing owned by the signed-in user, seeded straight into the database. */
    protected Material seedMaterial(String title, MaterialCategory category, String quantity, String unit,
            MaterialCondition condition, String price, boolean free, double latitude, double longitude) {

        Material material = new Material(owner(), title, category, "Seeded for the AI tests.",
                new BigDecimal(quantity), unit, condition, "Bhimavaram, Andhra Pradesh");
        material.setPrice(price == null ? null : new BigDecimal(price), free);
        material.setLatitude(BigDecimal.valueOf(latitude));
        material.setLongitude(BigDecimal.valueOf(longitude));

        return materialRepository.save(material);
    }

    // ----------------------------------------------------------------- calls

    /**
     * POST /api/ai/search-intent.
     *
     * <p>Each call comes from a client address of its own, so the public search
     * cap of one test never eats into another test's budget.</p>
     */
    protected JsonNode aiSearch(String searchQuery, String resourceType, String extraJson) throws Exception {
        String extra = extraJson == null || extraJson.isBlank() ? "" : "," + extraJson;

        String body = """
                {"searchQuery":"%s","resourceType":"%s"%s}
                """.formatted(searchQuery, resourceType, extra);

        MvcResult result = mockMvc.perform(post("/api/ai/search-intent")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .header("X-Forwarded-For", clientAddress())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        return node(result.getResponse().getContentAsString());
    }

    /** A distinct client address, so one test never spends another test's budget. */
    protected String clientAddress() {
        return "10." + (10 + (int) (Math.random() * 200)) + "." + (int) (Math.random() * 250)
                + "." + (int) (Math.random() * 250);
    }

    protected JsonNode node(String json) {
        return objectMapper.readTree(json);
    }

    protected String bearer(String accessToken) {
        return "Bearer " + accessToken;
    }

    protected String body(Object value) {
        return objectMapper.writeValueAsString(value);
    }
}
