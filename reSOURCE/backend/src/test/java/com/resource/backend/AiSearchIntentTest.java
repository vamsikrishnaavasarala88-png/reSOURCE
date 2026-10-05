package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import java.math.BigDecimal;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import com.resource.backend.ai.AiPrompt;
import com.resource.backend.ai.AiUnavailableException;
import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

import tools.jackson.databind.JsonNode;

/**
 * Natural-language search: the intent is understood by the AI, but the results
 * are produced by the backend's own filters over real rows.
 *
 * <p>The provider mock returns exactly the JSON a model would, including the
 * wrong parts - unknown categories, negative prices, quantities without units -
 * because those are the answers the validation layer exists for.</p>
 */
class AiSearchIntentTest extends AiIntelligenceTestSupport {

    private static final String SEARCH_URL = "/api/ai/search-intent";

    // ------------------------------------------------- §43.1 - spaces, free

    @Test
    void findsFreeSpacesForAnActivityWithCapacityAndRadius() throws Exception {
        seedSpace("Community Ground", ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, 300, 16.5449, 81.5212);
        seedSpace("Tiny Room", ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, 50, 16.5450, 81.5213);
        seedSpace("Paid Ground", ActivityType.BLOOD_DONATION, new BigDecimal("500"), false, 400, 16.5448, 81.5211);
        seedSpace("Far Ground", ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, 400, 17.5000, 81.5000);
        // Near the coordinates the model invented, far from the visitor: it must not appear.
        seedSpace("Model's Ground", ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, 400, 14.6000, 78.1000);

        // The model answers with the criteria and with coordinates of its own, which
        // are guesses about the world and are therefore ignored.
        providerAnswers("""
                {"resourceType":"SPACE","activity":"BLOOD_DONATION","freeOnly":true,"capacity":200,
                 "radiusKm":10,"latitude":14.5,"longitude":78.0,"maxPrice":null,"category":null}
                """);

        JsonNode response = aiSearch("free space for a blood donation camp for 200 people within 10 km",
                "SPACE", "\"latitude\":16.5449,\"longitude\":81.5212");

        assertThat(response.get("resourceType").asString()).isEqualTo("SPACE");
        assertThat(response.get("detectedResourceType").isNull()).isTrue();

        JsonNode intent = response.get("intent");
        assertThat(intent.get("activity").asString()).isEqualTo("BLOOD_DONATION");
        assertThat(intent.get("capacity").asInt()).isEqualTo(200);
        assertThat(intent.get("radiusKm").asDouble()).isEqualTo(10.0);
        assertThat(intent.get("freeOnly").asBoolean()).isTrue();
        assertThat(intent.get("maxPrice").decimalValue()).isEqualByComparingTo("0");
        assertThat(intent.get("latitude").isNull()).isTrue();
        assertThat(intent.get("longitude").isNull()).isTrue();

        assertThat(chips(response)).containsExactly("Blood Donation Camp", "Free", "200 people", "Within 10 km");
        assertThat(response.get("summary").asString())
                .isEqualTo("Showing spaces matching: Blood Donation Camp · Free · 200 people · Within 10 km");

        assertThat(titles(response)).containsExactly("Community Ground");
        assertThat(response.get("results").get("totalElements").asInt()).isEqualTo(1);
        assertThat(response.get("results").get("content").get(0).get("distanceKm").isNull()).isFalse();
    }

    @Test
    void appliesAPriceCeilingToSpaces() throws Exception {
        seedSpace("Cheap Hall", ActivityType.MEETING, new BigDecimal("300"), false, 50, 16.5449, 81.5212);
        seedSpace("Pricey Hall", ActivityType.MEETING, new BigDecimal("900"), false, 50, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MEETING","maxPrice":500}
                """);

        JsonNode response = aiSearch("a meeting hall under 500 rupees", "SPACE", null);

        assertThat(chips(response)).containsExactly("Meeting", "Up to ₹500");
        assertThat(titles(response)).containsExactly("Cheap Hall");
    }

    // ---------------------------------------------- §43.2 - materials, free

    @Test
    void findsFreeMaterialOfACategory() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);
        seedMaterial("Surplus Tiles", MaterialCategory.TILES, "100", "pieces",
                MaterialCondition.GOOD, null, true, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"TILES","freeOnly":true,"condition":"GOOD"}
                """);

        JsonNode response = aiSearch("free good tiles please", "MATERIAL", null);

        assertThat(response.get("resourceType").asString()).isEqualTo("MATERIAL");
        assertThat(chips(response)).containsExactly("Tiles", "Good", "Free");
        assertThat(titles(response)).containsExactly("Surplus Tiles");
    }

    @Test
    void appliesAQuantityFilterOnlyWhenTheUnitIsKnown() throws Exception {
        seedMaterial("Bulk Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);
        seedMaterial("Few Bricks", MaterialCategory.BRICKS, "50", "pieces",
                MaterialCondition.GOOD, "400", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","minQuantity":200,"quantityUnit":"pieces"}
                """);

        JsonNode response = aiSearch("at least 200 pieces of bricks", "MATERIAL", null);

        assertThat(response.get("intent").get("minQuantity").decimalValue()).isEqualByComparingTo("200");
        assertThat(chips(response)).containsExactly("Bricks", "At least 200 pieces");
        assertThat(titles(response)).containsExactly("Bulk Bricks");
    }

    // ------------------------------------------------ §43.4 - never trusted

    @Test
    void mapsAnUnknownCategoryToNothingInsteadOfBreakingTheQuery() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"ALIEN_METAL","condition":"SPARKLY"}
                """);

        JsonNode response = aiSearch("anything strange", "MATERIAL", null);

        assertThat(response.get("intent").get("category").isNull()).isTrue();
        assertThat(response.get("intent").get("condition").isNull()).isTrue();
        assertThat(chips(response)).isEmpty();
        assertThat(response.get("summary").asString())
                .isEqualTo("Showing all materials: nothing specific was picked out of your words.");
        assertThat(titles(response)).containsExactly("Red Clay Bricks");
    }

    @Test
    void dropsNegativeAndImpossibleNumbers() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","maxPrice":-500,"minQuantity":-20,"capacity":-3,
                 "radiusKm":-9,"latitude":999,"longitude":-400,"date":"yesterday"}
                """);

        JsonNode response = aiSearch("bricks with a strange filter", "MATERIAL", null);
        JsonNode intent = response.get("intent");

        assertThat(intent.get("maxPrice").isNull()).isTrue();
        assertThat(intent.get("minQuantity").isNull()).isTrue();
        assertThat(intent.get("capacity").isNull()).isTrue();
        assertThat(intent.get("radiusKm").isNull()).isTrue();
        assertThat(intent.get("latitude").isNull()).isTrue();
        assertThat(intent.get("longitude").isNull()).isTrue();
        assertThat(intent.get("date").isNull()).isTrue();
        assertThat(titles(response)).containsExactly("Red Clay Bricks");
    }

    @Test
    void neverClaimsAFilterItCouldNotApply() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        // A radius, but the browser sent no coordinates: the distance filter cannot
        // be applied, so it must not be reported either.
        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","radiusKm":10}
                """);

        JsonNode response = aiSearch("bricks within 10 km", "MATERIAL", null);

        assertThat(response.get("intent").get("radiusKm").isNull()).isTrue();
        assertThat(chips(response)).containsExactly("Bricks");
        assertThat(titles(response)).containsExactly("Red Clay Bricks");
    }

    @Test
    void keepsMaterialFiltersOffASpaceSearch() throws Exception {
        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("500"), false, 300, 16.5449, 81.5212);

        // The page is Spaces, so material-only criteria are not used - but the model's
        // reading is still reported as a hint.
        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","minQuantity":300,"quantityUnit":"pieces",
                 "condition":"GOOD"}
                """);

        JsonNode response = aiSearch("bricks for sale", "SPACE", null);

        assertThat(response.get("resourceType").asString()).isEqualTo("SPACE");
        assertThat(response.get("detectedResourceType").asString()).isEqualTo("MATERIAL");

        JsonNode intent = response.get("intent");
        assertThat(intent.get("category").isNull()).isTrue();
        assertThat(intent.get("condition").isNull()).isTrue();
        assertThat(intent.get("minQuantity").isNull()).isTrue();
        assertThat(intent.get("quantityUnit").isNull()).isTrue();

        assertThat(titles(response)).containsExactly("Community Ground");
    }

    // ------------------------------------------------------ §43.3 - failures

    @Test
    void answersWithAFallbackMessageWhenTheProviderReturnsGarbage() throws Exception {
        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("500"), false, 300, 16.5449, 81.5212);

        providerAnswers("I am not sure what you mean, human.");

        JsonNode response = aiSearch("something odd", "SPACE", null);

        assertThat(response.get("success").asBoolean()).isFalse();
        assertThat(response.get("message").asString())
                .isEqualTo("AI search is temporarily unavailable. You can use filters instead.");
        assertThat(response.get("fallbackAvailable").asBoolean()).isTrue();
        assertThat(response.has("results")).isFalse();
    }

    @Test
    void answersWithAFallbackMessageWhenTheProviderTimesOut() throws Exception {
        when(aiProvider.completeJson(any(AiPrompt.class)))
                .thenThrow(new AiUnavailableException("timeout", "too slow"));

        JsonNode response = aiSearch("anything at all", "SPACE", null);

        assertThat(response.get("success").asBoolean()).isFalse();
        assertThat(response.get("fallbackAvailable").asBoolean()).isTrue();
    }

    @Test
    void answersWithAFallbackMessageWhenNoProviderIsConfigured() throws Exception {
        when(aiProvider.isConfigured()).thenReturn(false);

        JsonNode response = aiSearch("anything at all", "MATERIAL", null);

        assertThat(response.get("success").asBoolean()).isFalse();
        assertThat(response.get("message").asString())
                .isEqualTo("AI search is temporarily unavailable. You can use filters instead.");

        // Nothing was sent anywhere, because there is nowhere to send it.
        verify(aiProvider, times(0)).completeJson(any(AiPrompt.class));
    }

    @Test
    void theMarketplaceStillWorksWhenAiIsNotConfigured() throws Exception {
        when(aiProvider.isConfigured()).thenReturn(false);

        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("500"), false, 300, 16.5449, 81.5212);
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/spaces"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/materials"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    // ---------------------------------------------------- §46 - cost control

    @Test
    void answersARepeatedQueryFromCacheInsteadOfPayingTwice() throws Exception {
        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET"}
                """);

        String address = clientAddress();

        for (int attempt = 0; attempt < 3; attempt++) {
            mockMvc.perform(post(SEARCH_URL)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token))
                            .header("X-Forwarded-For", address)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"searchQuery":"a market for vegetables","resourceType":"SPACE"}
                                    """))
                    .andExpect(status().isOk());
        }

        verify(aiProvider, times(1)).completeJson(any(AiPrompt.class));
    }

    @Test
    void capsHowOftenOneClientCanSearch() throws Exception {
        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET"}
                """);

        String address = clientAddress();

        for (int attempt = 0; attempt < 20; attempt++) {
            mockMvc.perform(post(SEARCH_URL)
                            .header("X-Forwarded-For", address)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"searchQuery":"market number %d","resourceType":"SPACE"}
                                    """.formatted(attempt)))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(post(SEARCH_URL)
                        .header("X-Forwarded-For", address)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"searchQuery":"one too many","resourceType":"SPACE"}
                                """))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.fallbackAvailable").value(true));
    }

    // ------------------------------------------------- §43.9 - input hygiene

    @Test
    void rejectsAQueryThatIsNotAQuery() throws Exception {
        mockMvc.perform(post(SEARCH_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"searchQuery":"   ","resourceType":"SPACE"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post(SEARCH_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"searchQuery":"%s","resourceType":"SPACE"}
                                """.formatted("x".repeat(400))))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post(SEARCH_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"searchQuery":"bricks","resourceType":"PLASMA"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void isOpenToVisitorsWhoAreNotSignedIn() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS"}
                """);

        mockMvc.perform(post(SEARCH_URL)
                        .header("X-Forwarded-For", clientAddress())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"searchQuery":"bricks","resourceType":"MATERIAL"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results.totalElements").value(1));
    }

    @Test
    void neverWritesAnythingBecauseOfASearch() throws Exception {
        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","minQuantity":300,"quantityUnit":"pieces"}
                """);

        long materialsBefore = materialRepository.count();
        long spacesBefore = spaceRepository.count();

        aiSearch("create bricks for me", "MATERIAL", null);

        assertThat(materialRepository.count()).isEqualTo(materialsBefore);
        assertThat(spaceRepository.count()).isEqualTo(spacesBefore);
    }

    // -------------------------------- §10/§43 - a search that finds nothing

    @Test
    void showsTheClosestListingsWhenNobodyHasThatMuchMaterial() throws Exception {
        // The owner listed 200 bricks; the visitor asks for 500.
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "200", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","minQuantity":500,"quantityUnit":"pieces"}
                """);

        JsonNode response = aiSearch("I want red bricks of 500 pieces", "MATERIAL", null);

        assertThat(titles(response)).containsExactly("Red Clay Bricks");
        assertThat(response.get("intent").get("minQuantity").isNull()).isTrue();
        assertThat(chips(response)).containsExactly("Bricks");
        assertThat(response.get("note").asString())
                .contains("no listing has 500 pieces or more");
        assertThat(response.get("note").asString()).contains("closest");
    }

    @Test
    void showsTheClosestSpacesWhenNoneIsBigEnough() throws Exception {
        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("500"), false, 100,
                16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","capacity":500}
                """);

        JsonNode response = aiSearch("a market space for 500 people", "SPACE", null);

        assertThat(titles(response)).containsExactly("Community Ground");
        assertThat(chips(response)).containsExactly("Market");
        assertThat(response.get("note").asString()).contains("no space is listed for 500 people");
    }

    @Test
    void fallsBackToTheVisitorsOwnWordsBeforeDroppingTheKindOfListing() throws Exception {
        // The model read "pallet" as metal; the listing is filed under wood.
        seedMaterial("Wooden Pallets", MaterialCategory.WOOD, "40", "pieces",
                MaterialCondition.GOOD, "1500", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"METAL"}
                """);

        JsonNode response = aiSearch("wooden pallets please", "MATERIAL", null);

        assertThat(titles(response)).containsExactly("Wooden Pallets");
        assertThat(response.get("note").asString()).contains("your words");
    }

    @Test
    void saysNothingWasRelaxedWhenEverythingMatched() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","minQuantity":200,"quantityUnit":"pieces"}
                """);

        JsonNode response = aiSearch("at least 200 pieces of bricks", "MATERIAL", null);

        assertThat(titles(response)).containsExactly("Red Clay Bricks");
        assertThat(response.get("note").isNull()).isTrue();
    }

    @Test
    void namesTheKindOfListingThatIsMissingWhenNothingElseIsFound() throws Exception {
        seedMaterial("Red Clay Bricks", MaterialCategory.BRICKS, "300", "pieces",
                MaterialCondition.GOOD, "2000", false, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"MATERIAL","category":"STONE"}
                """);

        JsonNode response = aiSearch("crushed stone for a driveway", "MATERIAL", null);

        // Nothing is listed under Stone, so the visitor is told that, and what
        // comes back is only ever a real listing.
        assertThat(titles(response)).containsExactly("Red Clay Bricks");
        assertThat(response.get("note").asString()).contains("nothing is listed under Stone");
    }

    @Test
    void stillShowsNothingWhenTheMarketplaceItselfIsEmpty() throws Exception {
        providerAnswers("""
                {"resourceType":"MATERIAL","category":"BRICKS","minQuantity":500,"quantityUnit":"pieces"}
                """);

        JsonNode response = aiSearch("red bricks of 500 pieces", "MATERIAL", null);

        assertThat(titles(response)).isEmpty();
        assertThat(response.get("results").get("totalElements").asLong()).isZero();
    }

    // ------------------------------------------- §43.1 - space facilities and size

    @Test
    void understandsTheFacilitiesASpaceMustHave() throws Exception {
        seedSpaceWith("Ground With Parking", ActivityType.MARKET, new BigDecimal("900"), false, 400,
                "3000", Set.of(Facility.PARKING, Facility.WASHROOMS), 16.5449, 81.5212);
        seedSpaceWith("Ground Without Parking", ActivityType.MARKET, new BigDecimal("900"), false, 400,
                "3000", Set.of(Facility.WATER), 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","facilities":["PARKING","WASHROOMS"]}
                """);

        JsonNode response = aiSearch("a market space with parking and washrooms", "SPACE", null);

        // Only the space that really offers both, and the criteria are shown.
        assertThat(titles(response)).containsExactly("Ground With Parking");
        assertThat(chips(response)).contains("Market", "With Parking, Washrooms");
        assertThat(response.get("note").isNull()).isTrue();
    }

    @Test
    void understandsTheSizeASpaceMustBe() throws Exception {
        seedSpaceWith("Big Ground", ActivityType.MARKET, new BigDecimal("900"), false, 400,
                "5000", Set.of(Facility.PARKING), 16.5449, 81.5212);
        seedSpaceWith("Small Yard", ActivityType.MARKET, new BigDecimal("900"), false, 400,
                "800", Set.of(Facility.PARKING), 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","minAreaSqft":2000}
                """);

        JsonNode response = aiSearch("a market space of at least 2000 sq ft", "SPACE", null);

        assertThat(titles(response)).containsExactly("Big Ground");
        assertThat(chips(response)).contains("From 2000 sq ft");
    }

    @Test
    void dropsAFacilityNobodyCouldOffer() throws Exception {
        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("900"), false, 400, 16.5449, 81.5212);

        // A word that is not a facility this marketplace has must not become a
        // filter, and must not be shown as one either.
        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","facilities":["HELICOPTER_PAD"]}
                """);

        JsonNode response = aiSearch("a market space with a helipad", "SPACE", null);

        assertThat(chips(response)).containsExactly("Market");
        assertThat(titles(response)).containsExactly("Community Ground");
    }

    @Test
    void dropsASizeThatCannotBeTrue() throws Exception {
        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("900"), false, 400, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","minAreaSqft":-500,"maxAreaSqft":99999999}
                """);

        JsonNode response = aiSearch("a market space, negative and absurd sizes", "SPACE", null);

        assertThat(chips(response)).containsExactly("Market");
        assertThat(titles(response)).containsExactly("Community Ground");
    }

    @Test
    void relaxesTheFacilitiesWhenNobodyOffersThem() throws Exception {
        seedSpaceWith("Ground Without A Stage", ActivityType.MARKET, new BigDecimal("900"), false, 400,
                "3000", Set.of(Facility.PARKING), 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","facilities":["PARKING","STAGE"]}
                """);

        JsonNode response = aiSearch("a market space with parking and a stage", "SPACE", null);

        // The listing is still shown, and the note says which part could not be met.
        assertThat(titles(response)).containsExactly("Ground Without A Stage");
        assertThat(response.get("note").asString())
                .contains("no space offers Parking and Stage")
                .contains("closest");
    }

    @Test
    void putsTheSpaceClosestToTheNumberAskedForFirst() throws Exception {
        seedSpace("Hall For 400", ActivityType.MARKET, new BigDecimal("900"), false, 400, 16.5449, 81.5212);
        seedSpace("Ground For 1000", ActivityType.MARKET, new BigDecimal("900"), false, 1000, 16.5449, 81.5212);
        seedSpace("Yard For 50", ActivityType.MARKET, new BigDecimal("900"), false, 50, 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","capacity":2000}
                """);

        JsonNode response = aiSearch("a market space for 2000 people", "SPACE", null);

        // Nothing holds 2000, so the capacity is relaxed - and then the order is
        // what was asked for, nearest first, not whichever was listed last.
        assertThat(titles(response))
                .containsExactly("Ground For 1000", "Hall For 400", "Yard For 50");
        assertThat(response.get("note").asString()).contains("no space is listed for 2000 people");
    }

    @Test
    void understandsFacilitiesAndSizeTogetherWithEverythingElse() throws Exception {
        seedSpaceWith("Ideal Hall", ActivityType.MEETING, new BigDecimal("4000"), false, 150,
                "2500", Set.of(Facility.PARKING, Facility.WASHROOMS, Facility.LIGHTING), 16.5449, 81.5212);
        seedSpaceWith("Wrong Size Hall", ActivityType.MEETING, new BigDecimal("4000"), false, 150,
                "900", Set.of(Facility.PARKING, Facility.WASHROOMS, Facility.LIGHTING), 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MEETING","capacity":100,"maxPrice":5000,
                 "facilities":["PARKING","WASHROOMS"],"minAreaSqft":2000}
                """);

        JsonNode response = aiSearch(
                "a meeting hall for 100 people with parking and washrooms, 2000 sq ft, under 5000",
                "SPACE", null);

        assertThat(titles(response)).containsExactly("Ideal Hall");
        assertThat(chips(response)).contains(
                "Meeting", "100 people", "With Parking, Washrooms", "From 2000 sq ft", "Up to ₹5000");
    }

    @Test
    void everyCriterionIsDroppedOneAtATime() throws Exception {
        // Only a small, unparked ground exists: capacity, then facilities, then the
        // size have to go before anything can be shown.
        seedSpaceWith("Plain Small Ground", ActivityType.MARKET, new BigDecimal("900"), false, 20,
                "400", Set.of(Facility.WATER), 16.5449, 81.5212);

        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET","capacity":900,
                 "facilities":["PARKING"],"minAreaSqft":5000}
                """);

        JsonNode response = aiSearch(
                "a market space for 900 people with parking, 5000 sq ft", "SPACE", null);

        assertThat(titles(response)).containsExactly("Plain Small Ground");

        String note = response.get("note").asString();
        assertThat(note)
                .contains("no space is listed for 900 people")
                .contains("no space offers Parking")
                .contains("no space that large is listed");
    }

    @Test
    void doesNotAskTheProviderTwiceForTheSameSentenceInFlight() throws Exception {
        seedSpace("Community Ground", ActivityType.MARKET, new BigDecimal("900"), false, 400, 16.5449, 81.5212);

        // The first search understands the sentence; the second is answered from
        // what the first one learned, so the provider hears it once.
        providerAnswers("""
                {"resourceType":"SPACE","activity":"MARKET"}
                """);

        JsonNode first = aiSearch("a market ground", "SPACE", null);
        JsonNode second = aiSearch("a market ground", "SPACE", null);

        assertThat(titles(first)).containsExactly("Community Ground");
        assertThat(titles(second)).containsExactly("Community Ground");
        verify(aiProvider, times(1)).completeJson(any(AiPrompt.class));
    }

    // ---------------------------------------------------------------- helpers

    private static java.util.List<String> chips(JsonNode response) {
        return response.get("chips").valueStream()
                .map(JsonNode::asString)
                .toList();
    }

    private static java.util.List<String> titles(JsonNode response) {
        JsonNode content = response.get("results").get("content");

        return content.valueStream()
                .map(item -> item.get("title").asString())
                .toList();
    }
}
