package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import java.math.RoundingMode;

import org.assertj.core.data.Offset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

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
import com.resource.backend.repository.MaterialRepository;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.UserRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Phase 7: geographic search on both marketplaces.
 *
 * <p>Everything here is about what the <em>backend</em> does with a location: the
 * radius is enforced against stored coordinates, the distance is computed from
 * them, an unusable coordinate or radius is dropped instead of trusted, and the
 * AI's radius intent ends up as a real database filter rather than a claim. The
 * seeded listings sit at known distances from the searched point so each edge -
 * on the boundary, just outside it, or with no coordinates at all - is a real
 * case rather than an approximation.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:location-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=integration-test-secret-long-enough-for-hs256-signing",
        "app.jwt.expiration-minutes=60",
        "app.seed.enabled=false",
        "spring.flyway.locations=classpath:db/migration",
        // The AI part of this suite needs a configured provider; the model is a mock.
        "app.ai.api-key=test-key",
        "app.ai.base-url=http://127.0.0.1:9/v1",
        "app.ai.model=test-model",
        "app.ai.cache-ttl-seconds=300"
})
@AutoConfigureMockMvc
class LocationSearchTest {

    /** 0.01° of latitude is about 1.11 km, so 0.09° is about 10 km. */
    private static final BigDecimal CENTRE_LAT = new BigDecimal("16.544900");
    private static final BigDecimal CENTRE_LON = new BigDecimal("81.521200");
    private static final BigDecimal NEARBY_LAT = new BigDecimal("16.553900");   // ~1.0 km
    private static final BigDecimal TEN_KM_LAT = new BigDecimal("16.634900");   // ~10.01 km
    private static final String KEYS = "latitude=" + CENTRE_LAT + "&longitude=" + CENTRE_LON;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SpaceRepository spaceRepository;

    @Autowired
    private MaterialRepository materialRepository;

    @Autowired
    private UserRepository userRepository;

    @MockitoBean
    private AiProvider aiProvider;

    private User owner;

    @BeforeEach
    void setUp() {
        spaceRepository.deleteAll();
        materialRepository.deleteAll();
        userRepository.deleteAll();

        owner = new User("Location Owner", "location.owner@example.com", "+91 90000 00001", "hash");
        owner = userRepository.save(owner);
    }

    // ------------------------------------------------------------------ spaces

    @Test
    void aRadiusReturnsOnlyWhatIsActuallyInsideIt() throws Exception {
        seedSpace("One Km Away", NEARBY_LAT);
        seedSpace("Twenty Km Away", new BigDecimal("16.724900"));
        seedSpace("No Coordinates", null);

        JsonNode page = search("/api/spaces/search", KEYS + "&radiusKm=10");

        assertThat(titles(page)).containsExactly("One Km Away");
        assertThat(page.get("content").get(0).get("distanceKm").asDouble()).isBetween(0.9, 1.1);
    }

    @Test
    void aListingExactlyOnTheBoundaryIsIncludedAndOneBeyondItIsNot() throws Exception {
        // The listing sits ~10.01 km away: inside 25 km, outside 10 km.
        seedSpace("Just Past Ten Km", TEN_KM_LAT);

        assertThat(titles(search("/api/spaces/search", KEYS + "&radiusKm=10"))).isEmpty();

        JsonNode wider = search("/api/spaces/search", KEYS + "&radiusKm=25");
        assertThat(titles(wider)).containsExactly("Just Past Ten Km");
        assertThat(wider.get("content").get(0).get("distanceKm").asDouble()).isBetween(9.9, 10.2);
    }

    @Test
    void aListingBuiltExactlyOnTheBoundaryIsIncluded() throws Exception {
        // Due north of the centre the Haversine inverse is exact, so this listing
        // really does sit on the 5 km line - to within the six decimal places a
        // coordinate is stored with, which is about ten centimetres.
        seedSpace("On The Five Km Line", northOf(5.0, RoundingMode.DOWN));
        seedSpace("One Metre Further Out", northOf(5.001, RoundingMode.UP));

        JsonNode atFive = search("/api/spaces/search", KEYS + "&radiusKm=5");

        assertThat(titles(atFive)).containsExactly("On The Five Km Line");
        // It is on the line: between 4.99945 km and 5.00000 km once the coordinate
        // is stored, i.e. within half a metre of exactly five kilometres.
        assertThat(atFive.get("content").get(0).get("distanceKm").asDouble()).isBetween(4.999, 5.0);

        // A hair tighter and even the boundary listing falls outside: the filter
        // is a real distance comparison, not a rounded one.
        assertThat(titles(search("/api/spaces/search", KEYS + "&radiusKm=4.999"))).isEmpty();
    }

    @Test
    void aRadiusSearchWorksAcrossTheAntimeridian() throws Exception {
        // Just west of the line and just east of it, with the visitor standing on
        // it: a single longitude range would match neither.
        Space west = seedSpaceAt("West Of The Line", new BigDecimal("-16.500000"), new BigDecimal("179.990000"));
        Space east = seedSpaceAt("East Of The Line", new BigDecimal("-16.500000"), new BigDecimal("-179.990000"));
        seedSpaceAt("Nowhere Near", new BigDecimal("-16.500000"), new BigDecimal("90.000000"));

        JsonNode page = search("/api/spaces/search",
                "latitude=-16.5&longitude=179.995&radiusKm=5");

        assertThat(titles(page)).containsExactlyInAnyOrder("West Of The Line", "East Of The Line");
        assertThat(page.get("content").get(0).get("distanceKm").asDouble()).isLessThan(5.0);
    }

    @Test
    void listingsWithoutCoordinatesNeverAppearInARadiusSearch() throws Exception {
        seedSpace("Everywhere And Nowhere", null);

        assertThat(titles(search("/api/spaces/search", KEYS + "&radiusKm=25"))).isEmpty();
        // They are still perfectly visible without a location filter.
        assertThat(titles(search("/api/spaces/search", ""))).containsExactly("Everywhere And Nowhere");
    }

    @Test
    void aRadiusWithoutCoordinatesFiltersNothing() throws Exception {
        seedSpace("One Km Away", NEARBY_LAT);
        seedSpace("Twenty Km Away", new BigDecimal("16.724900"));

        JsonNode page = search("/api/spaces/search", "radiusKm=1");

        assertThat(titles(page)).hasSize(2);
        assertThat(page.get("content").get(0).get("distanceKm").isNull()).isTrue();
    }

    @Test
    void anImpossibleRadiusIsIgnoredRatherThanApplied() throws Exception {
        seedSpace("One Km Away", NEARBY_LAT);
        seedSpace("Twenty Km Away", new BigDecimal("16.724900"));

        // Zero, negative, absurd and malformed radii all mean "no radius filter".
        for (String radius : List.of("0", "-5", "100000", "")) {
            JsonNode page = search("/api/spaces/search", KEYS + "&radiusKm=" + radius);
            assertThat(titles(page)).as("radiusKm=" + radius).hasSize(2);
        }
    }

    @Test
    void impossibleCoordinatesAreIgnoredRatherThanRejected() throws Exception {
        seedSpace("One Km Away", NEARBY_LAT);

        JsonNode page = search("/api/spaces/search",
                "latitude=91.5&longitude=181.5&radiusKm=5");

        // Not a 400 and not an empty page: the location filter is simply dropped,
        // so the listing comes back with no distance attached to it.
        assertThat(titles(page)).containsExactly("One Km Away");
        assertThat(page.get("content").get(0).get("distanceKm").isNull()).isTrue();
    }

    @Test
    void halfACoordinateIsNotALocation() throws Exception {
        seedSpace("One Km Away", NEARBY_LAT);

        assertThat(titles(search("/api/spaces/search", "latitude=16.5449&radiusKm=5"))).hasSize(1);
        assertThat(titles(search("/api/spaces/search", "longitude=81.5212&radiusKm=5"))).hasSize(1);
    }

    @Test
    void radiusWorksTogetherWithEveryExistingFilter() throws Exception {
        Space free = seedSpace("Free Blood Camp Ground", NEARBY_LAT);
        free.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, null))));
        spaceRepository.save(free);

        Space paid = seedSpace("Paid Blood Camp Ground", NEARBY_LAT);
        paid.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.BLOOD_DONATION, new BigDecimal("2000"), false, null))));
        spaceRepository.save(paid);

        seedSpace("Free Ground Far Away", new BigDecimal("16.724900"));

        JsonNode page = search("/api/spaces/search",
                KEYS + "&radiusKm=10&activity=BLOOD_DONATION&maxPrice=0&minCapacity=200");

        assertThat(titles(page)).containsExactly("Free Blood Camp Ground");
    }

    @Test
    void nearestFirstOrdersByRealDistance() throws Exception {
        seedSpace("Twenty Km Away", new BigDecimal("16.724900"));
        seedSpace("One Km Away", NEARBY_LAT);
        seedSpace("Five Km Away", new BigDecimal("16.589900"));

        JsonNode page = search("/api/spaces/search", KEYS + "&sort=distance");

        assertThat(titles(page)).containsExactly("One Km Away", "Five Km Away", "Twenty Km Away");
    }

    // --------------------------------------------------------------- materials

    @Test
    void materialRadiusUsesTheSameBackendRules() throws Exception {
        seedMaterial("Nearby Bricks", NEARBY_LAT, "200", false);
        seedMaterial("Distant Bricks", new BigDecimal("16.724900"), "200", false);

        JsonNode page = search("/api/materials/search", KEYS + "&radiusKm=5&category=BRICKS");

        assertThat(titles(page)).containsExactly("Nearby Bricks");
        assertThat(page.get("content").get(0).get("distanceKm").asDouble()).isBetween(0.9, 1.1);
    }

    @Test
    void materialRadiusCombinesWithQuantityAndPrice() throws Exception {
        seedMaterial("Lots Of Bricks", NEARBY_LAT, "500", false);
        seedMaterial("A Few Bricks", NEARBY_LAT, "20", false);
        seedMaterial("Lots Of Bricks Far Away", new BigDecimal("16.724900"), "500", false);

        JsonNode page = search("/api/materials/search",
                KEYS + "&radiusKm=10&category=BRICKS&minQuantity=200&unit=pieces&maxPrice=5000");

        assertThat(titles(page)).containsExactly("Lots Of Bricks");
    }

    @Test
    void aMaterialWithoutCoordinatesStaysVisibleWithoutALocationFilter() throws Exception {
        seedMaterial("Somewhere Bricks", null, "100", false);

        assertThat(titles(search("/api/materials/search", "category=BRICKS")))
                .containsExactly("Somewhere Bricks");
        assertThat(titles(search("/api/materials/search", KEYS + "&radiusKm=25&category=BRICKS"))).isEmpty();
    }

    // -------------------------------------------------------- AI radius intent

    @Test
    void anAiRadiusIntentBecomesARealDatabaseFilter() throws Exception {
        whenTheModelAnswers("""
                {"resourceType":"SPACE","activity":"BLOOD_DONATION","freeOnly":true,"capacity":200,"radiusKm":10}
                """);

        Space near = seedSpace("Free Ground One Km", NEARBY_LAT);
        near.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, null))));
        spaceRepository.save(near);

        Space far = seedSpace("Free Ground Twenty Km", new BigDecimal("16.724900"));
        far.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, null))));
        spaceRepository.save(far);

        String body = """
                {"searchQuery":"free space for a blood donation camp for 200 people within 10 km",
                 "resourceType":"SPACE","latitude":%s,"longitude":%s}
                """.formatted(CENTRE_LAT, CENTRE_LON);

        JsonNode response = node(mockMvc.perform(post("/api/ai/search-intent")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        // The radius the model read out of the sentence is applied by the query,
        // against the coordinates the browser sent - not by the model.
        assertThat(titles(response.get("results"))).containsExactly("Free Ground One Km");
        assertThat(response.get("intent").get("radiusKm").asDouble()).isEqualTo(10.0);
        assertThat(response.get("intent").get("latitude").isNull()).isTrue();
    }

    @Test
    void anImpossibleAiRadiusIsDroppedRatherThanApplied() throws Exception {
        // The model is untrusted input like any other: a negative, zero, absurd or
        // textual radius must never reach a query.
        seedSpace("Far Ground", new BigDecimal("16.724900"));

        for (String radius : List.of("-10", "0", "100000", "\"ten\"")) {
            whenTheModelAnswers("""
                    {"resourceType":"SPACE","radiusKm":%s}
                    """.formatted(radius));

            String body = """
                    {"searchQuery":"a space within some distance","resourceType":"SPACE","latitude":%s,"longitude":%s}
                    """.formatted(CENTRE_LAT, CENTRE_LON);

            JsonNode response = node(mockMvc.perform(post("/api/ai/search-intent")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());

            assertThat(response.get("intent").get("radiusKm").isNull())
                    .as("radius %s must be dropped", radius)
                    .isTrue();
            assertThat(chips(response)).noneMatch(chip -> chip.contains("km"));
            // Nothing was filtered away: the far listing is still there.
            assertThat(titles(response.get("results"))).contains("Far Ground");
        }
    }

    void anAiRadiusWithoutCoordinatesIsNotClaimedAsApplied() throws Exception {
        whenTheModelAnswers("""
                {"resourceType":"SPACE","activity":"BLOOD_DONATION","radiusKm":10}
                """);
        seedSpace("Anywhere Ground", NEARBY_LAT);

        String body = """
                {"searchQuery":"a blood donation space within 10 km","resourceType":"SPACE"}
                """;

        JsonNode response = node(mockMvc.perform(post("/api/ai/search-intent")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        // No centre was sent, so no distance can be measured: the radius is
        // dropped from the intent and never shown as a criterion.
        assertThat(response.get("intent").get("radiusKm").isNull()).isTrue();
        assertThat(chips(response)).noneMatch(chip -> chip.contains("km"));
    }

    @Test
    void publicSearchCannotBeUsedToReadSomeoneElsesPrivateCoordinates() throws Exception {
        seedSpace("One Km Away", NEARBY_LAT);

        // A signed-out caller gets the listing's own published location - the
        // marketplace has to show where a space is - but the response carries no
        // contact details of any kind, and nothing about the caller.
        String payload = mockMvc.perform(get("/api/spaces/search?" + KEYS + "&radiusKm=10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode page = node(payload);

        assertThat(titles(page)).containsExactly("One Km Away");
        assertThat(payload).doesNotContain("email").doesNotContain("phone").doesNotContain("@");
    }

    // ---------------------------------------------------------------- helpers

    private JsonNode search(String path, String query) throws Exception {
        String url = query == null || query.isBlank() ? path : path + "?" + query;

        return node(mockMvc.perform(get(url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    /**
     * A latitude {@code km} due north of the centre: the inverse Haversine on a
     * meridian.
     *
     * <p>The rounding direction is chosen by the caller on purpose. A coordinate is
     * stored with six decimal places - about ten centimetres - and the radius
     * filter compares the real distance, so a fixture that must fall on the line
     * has to be rounded towards it, not away from it.</p>
     */
    private static BigDecimal northOf(double km, RoundingMode rounding) {
        return CENTRE_LAT.add(
                BigDecimal.valueOf(Math.toDegrees(km / 6371.0088)).setScale(6, rounding));
    }

    private Space seedSpaceAt(String title, BigDecimal latitude, BigDecimal longitude) {
        Space space = seedSpace(title, latitude);
        space.setLongitude(longitude);

        return spaceRepository.save(space);
    }

    private Space seedSpace(String title, BigDecimal latitude) {
        Space space = new Space(owner, title, "Seeded for the location tests.",
                "Bhimavaram, Andhra Pradesh");
        space.setLatitude(latitude);
        space.setLongitude(latitude == null ? null : CENTRE_LON);
        space.setArea(new BigDecimal("1000"), AreaUnit.SQ_FT);
        space.setCapacity(400);
        space.setStatus(SpaceStatus.ACTIVE);
        space.replaceFacilities(new LinkedHashSet<>(Set.of(Facility.PARKING, Facility.WATER)));
        space.replacePricing(new LinkedHashSet<>(List.of(
                new SpacePricing(ActivityType.MEETING, new BigDecimal("1000"), false, null))));

        return spaceRepository.save(space);
    }

    private Material seedMaterial(String title, BigDecimal latitude, String quantity, boolean free) {
        Material material = new Material(owner, title, MaterialCategory.BRICKS,
                "Seeded for the location tests.", new BigDecimal(quantity), "pieces",
                MaterialCondition.USED, "Bhimavaram, Andhra Pradesh");
        material.setPrice(free ? BigDecimal.ZERO : new BigDecimal("2000"), free);
        material.setLatitude(latitude);
        material.setLongitude(latitude == null ? null : CENTRE_LON);

        return materialRepository.save(material);
    }

    private void whenTheModelAnswers(String answer) {
        org.mockito.Mockito.when(aiProvider.isConfigured()).thenReturn(true);
        org.mockito.Mockito.when(aiProvider.completeJson(org.mockito.ArgumentMatchers.any(AiPrompt.class)))
                .thenReturn(answer);
    }

    private static List<String> titles(JsonNode page) {
        return page.get("content").valueStream()
                .map(item -> item.get("title").asString())
                .toList();
    }

    private static List<String> chips(JsonNode response) {
        return response.get("chips").valueStream()
                .map(JsonNode::asString)
                .toList();
    }

    private JsonNode node(String json) {
        return objectMapper.readTree(json);
    }
}
