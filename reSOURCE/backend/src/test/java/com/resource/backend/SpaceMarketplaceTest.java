package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpaceStatus;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.UserRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * End-to-end tests for the Space Marketplace: creation, ownership, editing,
 * soft deletion, activity pricing and structured search.
 *
 * <p>Runs on in-memory H2 in PostgreSQL mode with the real Flyway migrations,
 * and stores uploads in a temporary directory.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:space-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=" + SpaceMarketplaceTest.TEST_SECRET,
        "app.jwt.expiration-minutes=60",
        "app.storage.type=local",
        "app.storage.public-base-path=/api/files/spaces",
        "app.storage.max-file-size-bytes=1048576",
        "app.seed.enabled=false",
        // .env is loaded even here, so the PostgreSQL-only migration folder is
        // explicitly excluded: these tests run the portable migrations on H2.
        "spring.flyway.locations=classpath:db/migration"
})
@AutoConfigureMockMvc
class SpaceMarketplaceTest {

    static final String TEST_SECRET = "integration-test-secret-long-enough-for-hs256-signing";

    private static final Path STORAGE_DIRECTORY;

    static {
        try {
            STORAGE_DIRECTORY = Files.createTempDirectory("resource-space-photos");
        } catch (Exception exception) {
            throw new IllegalStateException("Could not create a temporary upload directory", exception);
        }
    }

    @DynamicPropertySource
    static void storageDirectory(DynamicPropertyRegistry registry) {
        registry.add("app.storage.local-directory", () -> STORAGE_DIRECTORY.toString());
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SpaceRepository spaceRepository;

    @Autowired
    private UserRepository userRepository;

    private String ownerToken;
    private String otherToken;

    @TempDir
    Path tempDirectory;

    @BeforeEach
    void setUp() throws Exception {
        spaceRepository.deleteAll();
        userRepository.deleteAll();

        ownerToken = registerAndLogin("owner@example.com");
        otherToken = registerAndLogin("other@example.com");
    }

    // ----------------------------------------------------------------- create

    @Test
    void authenticatedUserCanCreateASpace() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.title").value("Community Ground"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.capacity").value(500))
                .andExpect(jsonPath("$.area").value(1.5))
                .andExpect(jsonPath("$.areaUnit").value("ACRES"))
                .andExpect(jsonPath("$.facilities.length()").value(4))
                .andExpect(jsonPath("$.pricing.length()").value(6))
                .andExpect(jsonPath("$.owner.name").value("Owner Example"))
                .andExpect(jsonPath("$.isOwner").value(true))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andExpect(jsonPath("$.owner.email").doesNotExist());
    }

    @Test
    void creatingASpaceRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ownerIdSentByTheClientIsIgnored() throws Exception {
        String response = mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("\"title\"", "\"ownerId\": 99999, \"title\"")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        long id = ((Number) objectMapper.readValue(response, Map.class).get("id")).longValue();

        mockMvc.perform(get("/api/spaces/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.owner.id").value(1))
                .andExpect(jsonPath("$.owner.name").value("Owner Example"))
                .andExpect(jsonPath("$.isOwner").value(false));
    }

    @Test
    void validationRejectsAnEmptyOrNonsenseSpace() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"","description":"short","address":"","latitude":120,"longitude":-200,
                                 "area":0,"areaUnit":"ACRES","capacity":0,"pricing":[]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").exists())
                .andExpect(jsonPath("$.errors.description").exists())
                .andExpect(jsonPath("$.errors.address").exists())
                .andExpect(jsonPath("$.errors.latitude").exists())
                .andExpect(jsonPath("$.errors.longitude").exists())
                .andExpect(jsonPath("$.errors.area").exists())
                .andExpect(jsonPath("$.errors.capacity").exists())
                .andExpect(jsonPath("$.errors.pricing").exists());

        assertThat(spaceRepository.count()).isZero();
    }

    @Test
    void atLeastOneActivityIsRequired() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("""
                                "pricing":[{"activityType":"MARKET","isFree":false,"price":500,"ownerNote":null},
                                        {"activityType":"BLOOD_DONATION","isFree":true,"price":null,"ownerNote":"Free for camps"},
                                        {"activityType":"EXHIBITION","isFree":false,"price":1000,"ownerNote":null},
                                        {"activityType":"MEDICAL_CAMP","isFree":true,"price":0,"ownerNote":null},
                                        {"activityType":"UNION_MEETING","isFree":false,"price":500,"ownerNote":null},
                                        {"activityType":"STUDENT_FEST","isFree":false,"price":500,"ownerNote":null}]""", "\"pricing\":[]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.pricing").exists());
    }

    @Test
    void duplicateActivitiesAreRejected() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("\"pricing\":[", """
                                "pricing":[{"activityType":"MARKET","isFree":false,"price":100,"ownerNote":null},""")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Each activity can only be listed once: Market."));
    }

    // ---------------------------------------------------------------- pricing

    @Test
    void activitySpecificPricingIsStoredAsListed() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(get("/api/spaces/{id}/pricing", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[?(@.activityType=='MARKET')].price").value(500.0))
                .andExpect(jsonPath("$[?(@.activityType=='EXHIBITION')].price").value(1000.0))
                .andExpect(jsonPath("$[?(@.activityType=='BLOOD_DONATION')].isFree").value(true))
                .andExpect(jsonPath("$[?(@.activityType=='BLOOD_DONATION')].price").value(0.0))
                .andExpect(jsonPath("$[?(@.activityType=='MEDICAL_CAMP')].activityLabel")
                        .value("Medical Camp"));
    }

    @Test
    void freeActivitiesAreStoredWithZeroPrice() throws Exception {
        String response = mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("\"isFree\":true,\"price\":null",
                                "\"isFree\":true,\"price\":450")))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        // The owner marked it free, so whatever price was sent is stored as 0.
        assertThat(pricingOf(response, "BLOOD_DONATION").get("price").toString())
                .isEqualTo("0");
        assertThat(pricingOf(response, "BLOOD_DONATION").get("isFree")).isEqualTo(true);
    }

    @Test
    void priceValidationRejectsNegativeAndMissingPrices() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("\"price\":1000", "\"price\":-5")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['pricing[2].price']").exists());

        mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("\"price\":1000", "\"price\":null")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Enter a price for Exhibition or mark it as free."));
    }

    // ------------------------------------------------------------------ reads

    @Test
    void activeSpacesAreListedPubliclyWithPagination() throws Exception {
        createSampleSpace();

        mockMvc.perform(get("/api/spaces").param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Community Ground"))
                .andExpect(jsonPath("$.content[0].primaryImageUrl").doesNotExist())
                .andExpect(jsonPath("$.content[0].fromPrice").value(500))
                .andExpect(jsonPath("$.content[0].freeActivities.length()").value(2))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void spaceDetailsArePublicButMissingSpacesAreNotFound() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(get("/api/spaces/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").isNotEmpty())
                .andExpect(jsonPath("$.availability").isNotEmpty())
                .andExpect(jsonPath("$.ownerNote").value("Medical camps and blood donation camps are free."))
                .andExpect(jsonPath("$.isOwner").value(false))
                .andExpect(jsonPath("$.owner.name").value("Owner Example"));

        mockMvc.perform(get("/api/spaces/{id}", 4242)).andExpect(status().isNotFound());

        long deleted = createSampleSpace();
        mockMvc.perform(delete("/api/spaces/{id}", deleted)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/spaces/{id}", deleted)).andExpect(status().isNotFound());
    }

    // ----------------------------------------------------------------- search

    @Test
    void searchByActivityUsesStructuredPricing() throws Exception {
        long id = createSampleSpace();
        long other = createSecondSpace();

        mockMvc.perform(get("/api/spaces/search").param("activity", "EXHIBITION"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/spaces/search").param("activity", "BLOOD_DONATION"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        // Only the community ground lists a market, and the id proves the filter
        // works on the pricing table rather than on the description text.
        mockMvc.perform(get("/api/spaces/search").param("activity", "MARKET"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value((int) id));

        mockMvc.perform(get("/api/spaces/search").param("activity", "SPORTS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        assertThat(other).isNotEqualTo(id);
    }

    @Test
    void searchByMaximumPriceTreatsZeroAsFreeOnly() throws Exception {
        createSampleSpace();
        createSecondSpace();

        // Free activities exist on both listings.
        mockMvc.perform(get("/api/spaces/search").param("maxPrice", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        // Both listings are free for blood donation, so narrowing by activity keeps them.
        mockMvc.perform(get("/api/spaces/search")
                        .param("activity", "BLOOD_DONATION")
                        .param("maxPrice", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        // No listing is free for the market, so free-only search finds nothing.
        mockMvc.perform(get("/api/spaces/search")
                        .param("activity", "MARKET")
                        .param("maxPrice", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        // A paid budget of 600 includes the ₹500 market but not the ₹1000 exhibition.
        mockMvc.perform(get("/api/spaces/search")
                        .param("activity", "MARKET")
                        .param("maxPrice", "600"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        // Nothing is free for exhibitions, so a ₹600 budget finds nothing.
        mockMvc.perform(get("/api/spaces/search")
                        .param("activity", "EXHIBITION")
                        .param("maxPrice", "600"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        // A ₹2500 budget covers both exhibitions (₹1000 and ₹2000).
        mockMvc.perform(get("/api/spaces/search")
                        .param("activity", "EXHIBITION")
                        .param("maxPrice", "2500"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void searchFiltersByCapacityAreaAndFacilities() throws Exception {
        createSampleSpace();   // 500 people, 1.5 acres, parking/water/electricity/road access
        createSecondSpace();   // 60 people, 900 sq ft, electricity/lighting/washrooms

        mockMvc.perform(get("/api/spaces/search").param("minCapacity", "200"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Community Ground"));

        // 1000 sq ft normalises to a range that only the second listing fits.
        mockMvc.perform(get("/api/spaces/search")
                        .param("maxArea", "1000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Mini Hall"));

        mockMvc.perform(get("/api/spaces/search").param("facilities", "PARKING", "WATER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Community Ground"));

        mockMvc.perform(get("/api/spaces/search").param("facilities", "PARKING", "STAGE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        mockMvc.perform(get("/api/spaces/search").param("q", "community"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void searchFiltersByDistanceWithHaversine() throws Exception {
        createSampleSpace();   // 16.5449, 81.5212
        createSecondSpace();   // 16.5480, 81.5265 - about 0.6 km away
        createFarSpace();      // 17.0004, 81.7809 - about 55 km away

        // Radius around the first listing keeps the near spaces and drops the far one.
        mockMvc.perform(get("/api/spaces/search")
                        .param("latitude", "16.5449")
                        .param("longitude", "81.5212")
                        .param("radiusKm", "5")
                        .param("sort", "distance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].title").value("Community Ground"))
                .andExpect(jsonPath("$.content[0].distanceKm").value(0.0))
                .andExpect(jsonPath("$.content[1].distanceKm").isNumber());

        // A wider radius reaches the far listing too.
        mockMvc.perform(get("/api/spaces/search")
                        .param("latitude", "16.5449")
                        .param("longitude", "81.5212")
                        .param("radiusKm", "70")
                        .param("sort", "distance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[2].title").value("Far Away Ground"));
    }

    // ------------------------------------------------------------- ownership

    @Test
    void onlyTheOwnerCanEditASpace() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(put("/api/spaces/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(otherToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("Community Ground", "Hijacked Ground")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You are not authorized to modify this space."))
                .andExpect(jsonPath("$.path").value("/api/spaces/" + id));

        mockMvc.perform(get("/api/spaces/{id}", id))
                .andExpect(jsonPath("$.title").value("Community Ground"));
    }

    @Test
    void onlyTheOwnerCanDeleteASpace() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(delete("/api/spaces/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You are not authorized to delete this space."));

        mockMvc.perform(get("/api/spaces/{id}", id)).andExpect(status().isOk());
        mockMvc.perform(get("/api/spaces")).andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void updatingWithoutATokenIsRejected() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(put("/api/spaces/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson()))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/spaces/{id}", id)).andExpect(status().isUnauthorized());
    }

    @Test
    void ownerCanEditTheirListingIncludingPricingAndFacilities() throws Exception {
        long id = createSampleSpace();

        String updatedBody = mockMvc.perform(put("/api/spaces/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Community Ground (Renovated)","description":"Freshly levelled ground for events.",
                                 "address":"Main Road, Bhimavaram","latitude":16.5449,"longitude":81.5212,
                                 "area":2,"areaUnit":"ACRES","capacity":600,"availability":"Weekends",
                                 "ownerNote":"Now with floodlights.",
                                 "facilities":["PARKING","WATER","LIGHTING"],
                                 "pricing":[{"activityType":"MARKET","isFree":false,"price":750,"ownerNote":null},
                                            {"activityType":"BLOOD_DONATION","isFree":true,"price":null,"ownerNote":null}],
                                 "status":"ACTIVE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Community Ground (Renovated)"))
                .andExpect(jsonPath("$.capacity").value(600))
                .andExpect(jsonPath("$.facilities.length()").value(3))
                .andExpect(jsonPath("$.pricing.length()").value(2))
                .andReturn().getResponse().getContentAsString();

        assertThat(new java.math.BigDecimal(pricingOf(updatedBody, "MARKET").get("price").toString()))
                .isEqualByComparingTo(new java.math.BigDecimal("750"));

        // Old pricing rows are replaced, not duplicated.
        mockMvc.perform(get("/api/spaces/{id}/pricing", id))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.activityType=='EXHIBITION')]").isEmpty());
    }

    @Test
    void ownerCanPauseAndResumeAListing() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(put("/api/spaces/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sampleSpaceJson().replace("\"pricing\":[", "\"status\":\"INACTIVE\",\"pricing\":[")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));

        // Paused listings stay reachable by link but leave discovery.
        mockMvc.perform(get("/api/spaces")).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/spaces/{id}", id)).andExpect(status().isOk());

        mockMvc.perform(get("/api/spaces/mine").header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("INACTIVE"));
    }

    @Test
    void deletedSpacesDisappearFromDiscoveryButKeepTheirRow() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(delete("/api/spaces/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/spaces")).andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/spaces/search").param("activity", "MARKET"))
                .andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/api/spaces/{id}", id)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/spaces/mine").header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(jsonPath("$.length()").value(0));

        Space stored = spaceRepository.findById(id).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(SpaceStatus.DELETED);
        assertThat(stored.getTitle()).isEqualTo("Community Ground");
    }

    @Test
    void mySpacesEndpointRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/spaces/mine")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ photos

    @Test
    void ownerCanUploadAndDeletePhotos() throws Exception {
        long id = createSampleSpace();

        String response = mockMvc.perform(multipart("/api/spaces/{id}/photos", id)
                        .file(photo())
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.photos.length()").value(1))
                .andExpect(jsonPath("$.photos[0].imageUrl").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        Map<?, ?> payload = objectMapper.readValue(response, Map.class);
        Map<?, ?> photo = (Map<?, ?>) ((java.util.List<?>) payload.get("photos")).get(0);
        String imageUrl = (String) photo.get("imageUrl");
        long photoId = ((Number) photo.get("id")).longValue();

        // The image is served back over HTTP from local storage.
        mockMvc.perform(get(imageUrl))
                .andExpect(status().isOk());

        assertThat(Files.list(STORAGE_DIRECTORY).count()).isEqualTo(1);

        mockMvc.perform(delete("/api/spaces/{id}/photos/{photoId}", id, photoId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos.length()").value(0));

        assertThat(Files.list(STORAGE_DIRECTORY).count()).isZero();
    }

    @Test
    void onlyTheOwnerCanManagePhotos() throws Exception {
        long id = createSampleSpace();

        mockMvc.perform(multipart("/api/spaces/{id}/photos", id).file(photo()))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(multipart("/api/spaces/{id}/photos", id)
                        .file(photo())
                        .header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(status().isForbidden());
    }

    @Test
    void nonImageUploadsAreRejected() throws Exception {
        long id = createSampleSpace();

        MockMultipartFile text = new MockMultipartFile(
                "files", "notes.txt", MediaType.TEXT_PLAIN_VALUE, "not an image".getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/spaces/{id}/photos", id)
                        .file(text)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only JPEG, PNG and WebP images can be uploaded."));
    }

    // ---------------------------------------------------------------- helpers

    private long createSampleSpace() throws Exception {
        return createSpace(sampleSpaceJson(), ownerToken);
    }

    private long createSecondSpace() throws Exception {
        return createSpace("""
                {"title":"Mini Hall","description":"Compact indoor hall for small meetings and workshops.",
                 "address":"Gandhi Nagar, Bhimavaram","latitude":16.5480,"longitude":81.5265,
                 "area":900,"areaUnit":"SQ_FT","capacity":60,"availability":"Mornings",
                 "ownerNote":null,"facilities":["ELECTRICITY","LIGHTING","WASHROOMS"],
                 "pricing":[{"activityType":"BLOOD_DONATION","isFree":true,"price":null,"ownerNote":null},
                            {"activityType":"EXHIBITION","isFree":false,"price":2000,"ownerNote":null}]}
                """, ownerToken);
    }

    private long createFarSpace() throws Exception {
        return createSpace("""
                {"title":"Far Away Ground","description":"Ground far from the city centre for big gatherings.",
                 "address":"Outer Ring Road, Eluru","latitude":17.0004,"longitude":81.7809,
                 "area":3,"areaUnit":"ACRES","capacity":900,"availability":"Any day",
                 "ownerNote":null,"facilities":["PARKING","ROAD_ACCESS"],
                 "pricing":[{"activityType":"MARKET","isFree":false,"price":400,"ownerNote":null}]}
                """, ownerToken);
    }

    private long createSpace(String json, String token) throws Exception {
        String response = mockMvc.perform(post("/api/spaces")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        return ((Number) objectMapper.readValue(response, Map.class).get("id")).longValue();
    }

    private String sampleSpaceJson() {
        return """
                {"title":"Community Ground",
                 "description":"Open community ground suitable for temporary events and community activities.",
                 "address":"Main Road, Bhimavaram","latitude":16.5449,"longitude":81.5212,
                 "area":1.5,"areaUnit":"ACRES","capacity":500,
                 "availability":"Available on weekends and public holidays",
                 "ownerNote":"Medical camps and blood donation camps are free.",
                 "facilities":["PARKING","WATER","ELECTRICITY","ROAD_ACCESS"],
                 "pricing":[{"activityType":"MARKET","isFree":false,"price":500,"ownerNote":null},
                        {"activityType":"BLOOD_DONATION","isFree":true,"price":null,"ownerNote":"Free for camps"},
                        {"activityType":"EXHIBITION","isFree":false,"price":1000,"ownerNote":null},
                        {"activityType":"MEDICAL_CAMP","isFree":true,"price":0,"ownerNote":null},
                        {"activityType":"UNION_MEETING","isFree":false,"price":500,"ownerNote":null},
                        {"activityType":"STUDENT_FEST","isFree":false,"price":500,"ownerNote":null}]}
                """;
    }

    /** Pulls one activity's pricing entry out of a JSON response. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> pricingOf(String json, String activityType) throws Exception {
        Map<String, Object> payload = objectMapper.readValue(json, Map.class);
        List<?> pricing = (List<?>) payload.get("pricing");

        return (Map<String, Object>) pricing.stream()
                .map(entry -> (Map<String, Object>) entry)
                .filter(entry -> activityType.equals(entry.get("activityType")))
                .findFirst()
                .orElseThrow();
    }

    private MockMultipartFile photo() {
        byte[] png = new byte[] {
                (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0
        };
        return new MockMultipartFile("files", "ground.png", MediaType.IMAGE_PNG_VALUE, png);
    }

    private String registerAndLogin(String email) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","email":"%s","phone":"+91 90000 00000","password":"StrongPass123"}
                                """.formatted(email.startsWith("owner") ? "Owner Example" : "Other Example", email)))
                .andExpect(status().isCreated());

        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"StrongPass123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        return (String) objectMapper.readValue(response, Map.class).get("accessToken");
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
