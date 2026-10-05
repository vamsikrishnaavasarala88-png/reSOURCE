package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialStatus;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.repository.BookingRepository;
import com.resource.backend.repository.MaterialRepository;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.SpaceRequestRepository;
import com.resource.backend.repository.UserRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * End-to-end tests for the Phase 5 surplus material marketplace.
 *
 * <p>Runs on in-memory H2 in PostgreSQL mode with the real Flyway migrations, so
 * the same schema the application uses in production is the one under test.</p>
 *
 * <p>Covers the whole brief: creation and persistence, ownership protection,
 * soft delete, every filter, validation of each field, and - because this phase
 * does implement them - material requests, acceptance, rejection, cancellation
 * and the contact privacy rule. The last tests prove the space request and
 * booking workflow still behaves exactly as it did in Phase 4.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:material-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=" + MaterialMarketplaceTest.TEST_SECRET,
        "app.jwt.expiration-minutes=60",
        "app.seed.enabled=false",
        "spring.flyway.locations=classpath:db/migration"
})
@AutoConfigureMockMvc
class MaterialMarketplaceTest {

    static final String TEST_SECRET = "integration-test-secret-long-enough-for-hs256-signing";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MaterialRepository materialRepository;

    @Autowired
    private SpaceRepository spaceRepository;

    @Autowired
    private SpaceRequestRepository requestRepository;

    @Autowired
    private BookingRepository bookingRepository;

    private String ownerToken;
    private String requesterToken;
    private String strangerToken;

    private Long ownerId;
    private Long materialId;

    @BeforeEach
    void setUp() throws Exception {
        bookingRepository.deleteAll();
        requestRepository.deleteAll();
        materialRepository.deleteAll();
        spaceRepository.deleteAll();
        userRepository.deleteAll();

        ownerToken = registerAndLogin("owner@example.com", "Owner Example");
        requesterToken = registerAndLogin("requester@example.com", "Requester Example");
        strangerToken = registerAndLogin("stranger@example.com", "Stranger Example");

        ownerId = userRepository.findByEmailIgnoreCase("owner@example.com").orElseThrow().getId();

        materialId = createMaterial("Red Clay Bricks", "BRICKS", "300", "pieces", "GOOD",
                "2000", false, "Jaggampeta, Andhra Pradesh");
    }

    // ------------------------------------------------------------- §42.1 - §42.5

    @Test
    void authenticatedUserCanCreateMaterialAndItIsPersisted() throws Exception {
        String response = mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Surplus Tiles", "TILES", "100", "pieces", "GOOD",
                                "0", true, "Jaggampeta, Andhra Pradesh")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Surplus Tiles"))
                .andExpect(jsonPath("$.category").value("TILES"))
                .andExpect(jsonPath("$.categoryLabel").value("Tiles"))
                .andExpect(jsonPath("$.quantity").value(100))
                .andExpect(jsonPath("$.unit").value("pieces"))
                .andExpect(jsonPath("$.condition").value("GOOD"))
                .andExpect(jsonPath("$.conditionLabel").value("Good"))
                .andExpect(jsonPath("$.isFree").value(true))
                .andExpect(jsonPath("$.owner.name").value("Requester Example"))
                // Contact details are never part of a listing.
                .andExpect(jsonPath("$.owner.phone").doesNotExist())
                .andExpect(jsonPath("$.owner.email").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        Long createdId = idOf(response);
        Material stored = materialRepository.findById(createdId).orElseThrow();

        // The owner comes from the token, not from the body: this account is the requester.
        assertThat(stored.isOwnedBy(ownerId)).isFalse();
        assertThat(stored.getStatus()).isEqualTo(MaterialStatus.ACTIVE);
        assertThat(stored.getQuantity()).isEqualByComparingTo("100");
    }

    @Test
    void unauthenticatedUserCannotCreateMaterial() throws Exception {
        mockMvc.perform(post("/api/materials")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Anonymous Boards", "WOOD", "10", "pieces", "GOOD",
                                "100", false, "Somewhere")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void materialAppearsInTheMarketplace() throws Exception {
        mockMvc.perform(get("/api/materials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(materialId))
                .andExpect(jsonPath("$.content[0].title").value("Red Clay Bricks"))
                .andExpect(jsonPath("$.content[0].categoryLabel").value("Bricks"))
                .andExpect(jsonPath("$.content[0].conditionLabel").value("Good"))
                .andExpect(jsonPath("$.content[0].price").value(2000))
                .andExpect(jsonPath("$.content[0].isFree").value(false))
                .andExpect(jsonPath("$.content[0].primaryImageUrl").value((Object) null));
    }

    @Test
    void materialDetailsWork() throws Exception {
        mockMvc.perform(get("/api/materials/{id}", materialId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Red Clay Bricks"))
                .andExpect(jsonPath("$.description").value(
                        org.hamcrest.Matchers.containsString("Surplus material")))
                .andExpect(jsonPath("$.quantity").value(300))
                .andExpect(jsonPath("$.unit").value("pieces"))
                .andExpect(jsonPath("$.owner.name").value("Owner Example"))
                .andExpect(jsonPath("$.isOwner").value(false))
                .andExpect(jsonPath("$.photos.length()").value(0));

        // The owner sees the same listing marked as their own.
        mockMvc.perform(get("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isOwner").value(true));

        mockMvc.perform(get("/api/materials/{id}", 999999))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------- §42.6 - §42.10

    @Test
    void ownerCanEditTheirMaterial() throws Exception {
        mockMvc.perform(put("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Red Clay Bricks (cleaned)", "BRICKS", "280", "pieces",
                                "NEW", "1800", false, "Jaggampeta, Andhra Pradesh")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Red Clay Bricks (cleaned)"))
                .andExpect(jsonPath("$.quantity").value(280))
                .andExpect(jsonPath("$.condition").value("NEW"))
                .andExpect(jsonPath("$.price").value(1800));

        Material stored = materialRepository.findById(materialId).orElseThrow();
        assertThat(stored.getQuantity()).isEqualByComparingTo("280");
    }

    @Test
    void ownerCanDeleteTheirMaterialAndItLeavesDiscovery() throws Exception {
        mockMvc.perform(delete("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isNoContent());

        // Soft delete: the row is still there, marked deleted.
        assertThat(materialRepository.findById(materialId).orElseThrow().getStatus())
                .isEqualTo(MaterialStatus.DELETED);

        mockMvc.perform(get("/api/materials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        mockMvc.perform(get("/api/materials/{id}", materialId))
                .andExpect(status().isNotFound());

        // The owner can still manage what they deleted.
        mockMvc.perform(get("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DELETED"));

        mockMvc.perform(get("/api/materials/mine")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void nonOwnerCannotEditOrDeleteAMaterial() throws Exception {
        mockMvc.perform(put("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Hijacked", "BRICKS", "300", "pieces", "GOOD",
                                "10", false, "Elsewhere")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").exists());

        mockMvc.perform(delete("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/materials/{id}", materialId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Hijacked", "BRICKS", "300", "pieces", "GOOD",
                                "10", false, "Elsewhere")))
                .andExpect(status().isUnauthorized());

        assertThat(materialRepository.findById(materialId).orElseThrow().getTitle())
                .isEqualTo("Red Clay Bricks");
    }

    // ------------------------------------------------------------ §42.11 - §42.14

    @Test
    void categoryFilteringWorks() throws Exception {
        createMaterial("Wooden Boards", "WOOD", "40", "pieces", "GOOD", "1500", false, "Jaggampeta");

        mockMvc.perform(get("/api/materials").param("category", "BRICKS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].category").value("BRICKS"));

        mockMvc.perform(get("/api/materials").param("category", "WOOD"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Wooden Boards"));

        // An unknown category is rejected rather than silently ignored.
        mockMvc.perform(get("/api/materials").param("category", "PLASTIC"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void conditionFilteringWorks() throws Exception {
        createMaterial("Metal Pipes", "METAL", "25", "pieces", "USED", "2500", false, "Jaggampeta");

        mockMvc.perform(get("/api/materials").param("condition", "USED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Metal Pipes"));

        mockMvc.perform(get("/api/materials").param("condition", "DAMAGED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void freeOnlyFilteringWorks() throws Exception {
        Long freeId = createMaterial("Surplus Tiles", "TILES", "100", "pieces", "GOOD", "0", true,
                "Jaggampeta");

        mockMvc.perform(get("/api/materials").param("freeOnly", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(freeId))
                .andExpect(jsonPath("$.content[0].isFree").value(true))
                .andExpect(jsonPath("$.content[0].price").value(0));

        // A paid listing is never returned as free, even at a price of 0.
        createMaterial("Paid Tiles", "TILES", "50", "pieces", "GOOD", "0", false, "Jaggampeta");

        mockMvc.perform(get("/api/materials").param("freeOnly", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void maximumPriceFilteringWorks() throws Exception {
        createMaterial("Surplus Tiles", "TILES", "100", "pieces", "GOOD", "0", true, "Jaggampeta");
        createMaterial("Metal Pipes", "METAL", "25", "pieces", "USED", "2500", false, "Jaggampeta");

        // Free listings count as within any budget, the 2000 listing fits, 2500 does not.
        mockMvc.perform(get("/api/materials").param("maxPrice", "2000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        // 0 means free only, matching the space marketplace.
        mockMvc.perform(get("/api/materials").param("maxPrice", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].isFree").value(true));
    }

    // ------------------------------------------------------------ §42.15 - §42.22

    @Test
    void quantityFilteringOnlyComparesWithinOneUnit() throws Exception {
        createMaterial("Cement Bags", "CEMENT", "50", "bags", "NEW", "400", false, "Jaggampeta");

        // Without a unit the comparison would be meaningless, so it is refused.
        mockMvc.perform(get("/api/materials").param("minQuantity", "200"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Choose a unit as well: quantities in different units cannot be compared."));

        // With a unit, only listings in that unit are compared: the 300-piece
        // listing matches, and the 50-bag listing is never measured against pieces.
        mockMvc.perform(get("/api/materials").param("minQuantity", "200").param("unit", "pieces"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].unit").value("pieces"));

        mockMvc.perform(get("/api/materials").param("minQuantity", "400").param("unit", "pieces"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        // Units compare case-insensitively and ignore surrounding spaces.
        mockMvc.perform(get("/api/materials").param("minQuantity", "10").param("unit", " PIECES "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void invalidMaterialInputIsRejected() throws Exception {
        // Negative price.
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Bad Price", "BRICKS", "10", "pieces", "GOOD",
                                "-5", false, "Jaggampeta")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.price").exists());

        // Negative quantity.
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Bad Quantity", "BRICKS", "-10", "pieces", "GOOD",
                                "10", false, "Jaggampeta")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.quantity").exists());

        // Zero quantity is not a listing either.
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Nothing Left", "BRICKS", "0", "pieces", "GOOD",
                                "10", false, "Jaggampeta")))
                .andExpect(status().isBadRequest());

        // Unknown category and unknown condition.
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Wrong Category", "PLASTIC", "10", "pieces", "GOOD",
                                "10", false, "Jaggampeta")))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Wrong Condition", "BRICKS", "10", "pieces", "SHINY",
                                "10", false, "Jaggampeta")))
                .andExpect(status().isBadRequest());

        // Blank title, short description, missing unit.
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"","category":"BRICKS","description":"short","quantity":10,
                                 "unit":"","condition":"GOOD","price":10,"isFree":false,"address":""}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").exists())
                .andExpect(jsonPath("$.errors.description").exists())
                .andExpect(jsonPath("$.errors.unit").exists())
                .andExpect(jsonPath("$.errors.address").exists());
    }

    @Test
    void locationIsValidatedAndDistanceWorks() throws Exception {
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Off The Map","category":"STONE","description":"Coordinates out of range.",
                                 "quantity":10,"unit":"tonnes","condition":"GOOD","price":100,"isFree":false,
                                 "address":"Nowhere","latitude":91.5,"longitude":181.0}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.latitude").exists())
                .andExpect(jsonPath("$.errors.longitude").exists());

        // The seeded material sits near Jaggampeta; search from Bhimavaram.
        String response = mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Bricks Nearby","category":"BRICKS","description":"Stored close to town.",
                                 "quantity":500,"unit":"pieces","condition":"GOOD","price":1000,"isFree":false,
                                 "address":"Bhimavaram","latitude":16.5449,"longitude":81.5212}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertThat(idOf(response)).isNotNull();

        mockMvc.perform(get("/api/materials")
                        .param("latitude", "16.5449").param("longitude", "81.5212").param("radiusKm", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("Bricks Nearby"))
                .andExpect(jsonPath("$.content[0].distanceKm").isNumber());

        // Sorting by distance keeps the near listing first.
        mockMvc.perform(get("/api/materials")
                        .param("latitude", "16.5449").param("longitude", "81.5212").param("sort", "distance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].title").value("Bricks Nearby"));
    }

    @Test
    void paginationAndSortingWork() throws Exception {
        createMaterial("Wooden Boards", "WOOD", "40", "pieces", "GOOD", "1500", false, "Jaggampeta");
        createMaterial("Metal Pipes", "METAL", "25", "pieces", "USED", "2500", false, "Jaggampeta");

        mockMvc.perform(get("/api/materials").param("size", "2").param("page", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.first").value(true));

        mockMvc.perform(get("/api/materials").param("size", "2").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.last").value(true));

        mockMvc.perform(get("/api/materials").param("sort", "priceAsc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].price").value(1500))
                .andExpect(jsonPath("$.content[1].price").value(2000))
                .andExpect(jsonPath("$.content[2].price").value(2500));

        mockMvc.perform(get("/api/materials").param("sort", "priceDesc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].price").value(2500));
    }

    @Test
    void pausedListingsLeaveDiscoveryButStayWithTheirOwner() throws Exception {
        mockMvc.perform(put("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBodyWithStatus("Red Clay Bricks", "BRICKS", "300", "pieces",
                                "GOOD", "2000", false, "Jaggampeta", "INACTIVE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));

        mockMvc.perform(get("/api/materials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));

        mockMvc.perform(get("/api/materials/mine")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("INACTIVE"));

        // A paused listing is not publicly discoverable through its id either, but
        // its owner still opens it for management.
        mockMvc.perform(get("/api/materials/{id}", materialId))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"));

        mockMvc.perform(get("/api/materials/mine")
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void freeListingIgnoresAnyPriceSent() throws Exception {
        String response = mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody("Free Cement", "CEMENT", "20", "bags", "USED",
                                "500", true, "Jaggampeta")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.isFree").value(true))
                .andExpect(jsonPath("$.price").value(0))
                .andReturn().getResponse().getContentAsString();

        Material stored = materialRepository.findById(idOf(response)).orElseThrow();
        assertThat(stored.getPrice()).isEqualByComparingTo("0");
        assertThat(stored.isFree()).isTrue();
    }

    @Test
    void materialPhotosAreOwnerOnlyAndOrdered() throws Exception {
        // There is no photo in this test run, so the guard rails are what matter:
        // a stranger can neither upload nor change anything.
        mockMvc.perform(get("/api/materials/{id}", materialId))
                .andExpect(jsonPath("$.photos.length()").value(0));

        mockMvc.perform(put("/api/materials/{id}/photos/order", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[]"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/materials/{id}/photos/{photoId}", materialId, 12345)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isNotFound());
    }

    // --------------------------------- material requests (§42.23 - §42.30)

    @Test
    void requesterCanRequestMaterial() throws Exception {
        String response = requestMaterial("100", "I need 100 bricks for a small repair project.")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.resourceType").value("MATERIAL"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.statusLabel").value("Awaiting owner response"))
                .andExpect(jsonPath("$.quantityRequested").value(100))
                .andExpect(jsonPath("$.unit").value("pieces"))
                .andExpect(jsonPath("$.material.title").value("Red Clay Bricks"))
                .andExpect(jsonPath("$.space").value((Object) null))
                .andExpect(jsonPath("$.booking").value((Object) null))
                .andExpect(jsonPath("$.viewerRole").value("REQUESTER"))
                // Nothing is revealed before the owner accepts.
                .andExpect(jsonPath("$.contact").value((Object) null))
                .andReturn().getResponse().getContentAsString();

        Long requestId = idOf(response);

        mockMvc.perform(get("/api/requests/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(requestId))
                .andExpect(jsonPath("$[0].material.title").value("Red Clay Bricks"))
                .andExpect(jsonPath("$[0].quantityRequested").value(100))
                .andExpect(jsonPath("$[0].spaceTitle").value((Object) null))
                .andExpect(jsonPath("$[0].counterpart.name").value("Owner Example"));
    }

    @Test
    void onlyAuthenticatedUsersCanRequestMaterial() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialRequestBody("50", "Anonymous request")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void requesterCannotRequestTheirOwnMaterial() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialRequestBody("50", "Mine anyway")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You cannot request your own material."));
    }

    @Test
    void requestedQuantityCannotExceedWhatIsAvailable() throws Exception {
        requestMaterial("301", "Too many")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(
                        "You cannot request more than the available quantity.")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("300 pieces")));

        // Asking for everything is fine.
        requestMaterial("300", "All of them").andExpect(status().isCreated());
    }

    @Test
    void requestedQuantityMustBePositive() throws Exception {
        // Zero, negative and missing quantities all land on the same field error,
        // so the form can highlight the quantity box itself.
        requestMaterial("0", "None at all")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.quantityRequested")
                        .value("Enter how much material you need."));

        requestMaterial("-5", "Negative")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.quantityRequested").exists());

        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceType":"MATERIAL","resourceId":%d,"message":"No quantity given."}
                                """.formatted(materialId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.quantityRequested").exists());

        // A space request still needs its own fields, and says so per field.
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceType":"SPACE","resourceId":1,"expectedPeople":10}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.purpose").exists())
                .andExpect(jsonPath("$.errors.startTime").exists())
                .andExpect(jsonPath("$.errors.quantityRequested").doesNotExist());
    }

    @Test
    void materialThatIsNotAvailableCannotBeRequested() throws Exception {
        mockMvc.perform(delete("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isNoContent());

        requestMaterial("10", "Deleted material")
                .andExpect(status().isNotFound());

        Long pausedId = createMaterial("Paused Bricks", "BRICKS", "100", "pieces", "GOOD",
                "500", false, "Jaggampeta");

        mockMvc.perform(put("/api/materials/{id}", pausedId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBodyWithStatus("Paused Bricks", "BRICKS", "100", "pieces",
                                "GOOD", "500", false, "Jaggampeta", "INACTIVE")))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceType":"MATERIAL","resourceId":%d,"quantityRequested":10}
                                """.formatted(pausedId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This material is not available right now."));
    }

    @Test
    void materialRequestIsPrivateToItsTwoParties() throws Exception {
        Long requestId = idOf(requestMaterial("100", "Private request").andReturn()
                .getResponse().getContentAsString());

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").exists());

        mockMvc.perform(post("/api/requests/{id}/accept", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/requests/{id}/reject", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/requests/{id}/cancel", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void ownerAcceptingAMaterialRequestUnlocksContactsWithoutTouchingQuantity() throws Exception {
        Long requestId = idOf(requestMaterial("100", "I need 100 bricks.").andReturn()
                .getResponse().getContentAsString());

        // The owner sees the requester's name in the inbox but no contact details yet.
        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].counterpart.name").value("Requester Example"))
                .andExpect(jsonPath("$[0].counterpart.email").doesNotExist())
                .andExpect(jsonPath("$[0].counterpart.phone").doesNotExist());

        mockMvc.perform(post("/api/requests/{id}/accept", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                // A material acceptance is not a booking, so it must not say it is.
                .andExpect(jsonPath("$.statusLabel").value("Request accepted"))
                .andExpect(jsonPath("$.contact.email").value("requester@example.com"))
                .andExpect(jsonPath("$.contact.phone").value("+91 90000 00000"))
                // A material request never produces a booking.
                .andExpect(jsonPath("$.booking").value((Object) null));

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contact.email").value("owner@example.com"));

        // No booking was created anywhere.
        mockMvc.perform(get("/api/bookings/owner")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // Accepting does not move stock: this phase does not reserve quantities.
        Material stored = materialRepository.findById(materialId).orElseThrow();
        assertThat(stored.getQuantity()).isEqualByComparingTo("300");
        assertThat(stored.getStatus()).isEqualTo(MaterialStatus.ACTIVE);

        // And the listing is still discoverable, because nothing was reserved.
        mockMvc.perform(get("/api/materials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        // Accepting twice is an invalid transition.
        mockMvc.perform(post("/api/requests/{id}/accept", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isConflict());
    }

    @Test
    void ownerCanRejectAndRequesterCanCancelMaterialRequests() throws Exception {
        Long rejected = idOf(requestMaterial("10", "Please reject me").andReturn()
                .getResponse().getContentAsString());
        Long cancelled = idOf(requestMaterial("20", "Please cancel me").andReturn()
                .getResponse().getContentAsString());

        mockMvc.perform(post("/api/requests/{id}/reject", rejected)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.contact").value((Object) null));

        mockMvc.perform(post("/api/requests/{id}/cancel", cancelled)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.contact").value((Object) null));

        // The owner cannot cancel someone else's request, the requester cannot reject it.
        mockMvc.perform(post("/api/requests/{id}/cancel", rejected)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/requests/{id}/reject", cancelled)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isForbidden());

        // A cancelled or rejected request stays that way.
        mockMvc.perform(post("/api/requests/{id}/accept", cancelled)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isConflict());
    }

    // ------------------------------------- both marketplaces side by side

    @Test
    void spaceRequestsAndBookingsAreUnaffected() throws Exception {
        Long spaceId = createSpace("Community Ground").getId();
        String requestBody = """
                {"resourceType":"SPACE","resourceId":%d,"purpose":"BLOOD_DONATION",
                 "requestDate":"%s","startTime":"09:00","endTime":"14:00","expectedPeople":200,
                 "message":"Local blood donation camp."}
                """.formatted(spaceId, java.time.LocalDate.now().plusDays(9));

        Long spaceRequestId = idOf(mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.space.title").value("Community Ground"))
                .andExpect(jsonPath("$.material").value((Object) null))
                .andExpect(jsonPath("$.quantityRequested").value((Object) null))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/requests/{id}/accept", spaceRequestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.booking.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.booking.amount").value(0))
                .andExpect(jsonPath("$.contact.email").value("requester@example.com"));

        // A material request next to it: both kinds live in one table and neither
        // is confused for the other in a list.
        Long materialRequestId = idOf(requestMaterial("25", "Some bricks too").andReturn()
                .getResponse().getContentAsString());

        mockMvc.perform(get("/api/requests/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // Newest first: the material request was created last.
                .andExpect(jsonPath("$[0].resourceType").value("MATERIAL"))
                .andExpect(jsonPath("$[1].resourceType").value("SPACE"));

        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        // Deleting a material that has a request against it keeps the request intact.
        mockMvc.perform(delete("/api/materials/{id}", materialId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/requests/{id}", materialRequestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.material.title").value("Red Clay Bricks"));

        // The booking list still only knows about the space booking.
        mockMvc.perform(get("/api/bookings/owner")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].space.title").value("Community Ground"));
    }

    // ------------------------------------------------------------- helpers

    private ResultActions requestMaterial(String quantity, String message) throws Exception {
        return mockMvc.perform(post("/api/requests")
                .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(materialRequestBody(quantity, message)));
    }

    private String materialRequestBody(String quantity, String message) {
        return """
                {"resourceType":"MATERIAL","resourceId":%d,"quantityRequested":%s,"message":"%s"}
                """.formatted(materialId, quantity, message);
    }

    private Long createMaterial(String title, String category, String quantity, String unit,
            String condition, String price, boolean isFree, String address) throws Exception {

        String response = mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(materialBody(title, category, quantity, unit, condition, price,
                                isFree, address)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        return idOf(response);
    }

    private String materialBody(String title, String category, String quantity, String unit,
            String condition, String price, boolean isFree, String address) {

        return """
                {"title":"%s","category":"%s","description":"Surplus material listed for the marketplace.",
                 "quantity":%s,"unit":"%s","condition":"%s","price":%s,"isFree":%s,
                 "address":"%s","latitude":17.1167,"longitude":81.9333,
                 "ownerNote":"Pickup on weekends."}
                """.formatted(title, category, quantity, unit, condition, price, isFree, address);
    }

    private String materialBodyWithStatus(String title, String category, String quantity, String unit,
            String condition, String price, boolean isFree, String address, String status) {

        return """
                {"title":"%s","category":"%s","description":"Surplus material listed for the marketplace.",
                 "quantity":%s,"unit":"%s","condition":"%s","price":%s,"isFree":%s,
                 "address":"%s","latitude":17.1167,"longitude":81.9333,"status":"%s"}
                """.formatted(title, category, quantity, unit, condition, price, isFree, address, status);
    }

    /** A space with a free activity, so the Phase 4 path can be exercised here. */
    private Space createSpace(String title) {
        Space created = new Space(
                userRepository.findByEmailIgnoreCase("owner@example.com").orElseThrow(),
                title,
                "Open ground used for community events.",
                "Main Road, Bhimavaram");

        created.setArea(new BigDecimal("1.5"), AreaUnit.ACRES);
        created.setCapacity(500);
        created.replaceFacilities(new LinkedHashSet<>(Set.of()));
        created.replacePricing(Set.of(new SpacePricing(
                ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, "Free for camps")));

        return spaceRepository.saveAndFlush(created);
    }

    private Long idOf(String json) throws Exception {
        Object id = objectMapper.readValue(json, Map.class).get("id");

        return id == null ? null : ((Number) id).longValue();
    }

    private String registerAndLogin(String email, String name) throws Exception {
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

        return (String) objectMapper.readValue(response, Map.class).get("accessToken");
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
