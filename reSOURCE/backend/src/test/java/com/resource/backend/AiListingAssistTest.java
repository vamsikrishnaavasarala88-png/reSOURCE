package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.resource.backend.ai.AiPrompt;
import com.resource.backend.ai.AiUnavailableException;

import tools.jackson.databind.JsonNode;

/**
 * The two writing helpers: turning a description into fields, and turning
 * confirmed facts into a description.
 *
 * <p>Both are proposals. The tests check the numbers are only carried over when
 * the owner stated them, that a null stays null, and that nothing is ever
 * published by an AI call.</p>
 */
class AiListingAssistTest extends AiIntelligenceTestSupport {

    private static final String EXTRACTION_URL = "/api/ai/listing-extraction";
    private static final String DESCRIPTION_URL = "/api/ai/generate-description";

    // ------------------------------------------------------ §45 - extraction

    @Test
    void extractsTheFactsTheOwnerActuallyWrote() throws Exception {
        providerAnswers("""
                {"title":"Red Clay Bricks","category":"BRICKS",
                 "description":"About 300 red clay bricks left over from a compound wall, clean and dry.\\n\\nPrice: ₹2000.",
                 "condition":"GOOD","quantity":300,"quantityUnit":"pieces","price":2000,"isFree":null,
                 "locationText":"Jaggampeta, Andhra Pradesh"}
                """);

        JsonNode response = node(mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"I have 300 red clay bricks for ₹2000 for sale, pickup near Jaggampeta."}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(response.get("title").asString()).isEqualTo("Red Clay Bricks");
        assertThat(response.get("category").asString()).isEqualTo("BRICKS");
        assertThat(response.get("categoryLabel").asString()).isEqualTo("Bricks");
        assertThat(response.get("condition").asString()).isEqualTo("GOOD");
        assertThat(response.get("quantity").decimalValue()).isEqualByComparingTo("300");
        assertThat(response.get("quantityUnit").asString()).isEqualTo("pieces");
        assertThat(response.get("price").decimalValue()).isEqualByComparingTo("2000");
        assertThat(response.get("locationText").asString()).isEqualTo("Jaggampeta, Andhra Pradesh");
    }

    @Test
    void leavesAVagueQuantityEmpty() throws Exception {
        // "A large pile" is not a number, so the model answers null - and so does the API.
        providerAnswers("""
                {"title":"Bricks","category":"BRICKS","description":"A pile of bricks.","condition":null,
                 "quantity":null,"quantityUnit":null,"price":null,"isFree":null,"locationText":null}
                """);

        JsonNode response = node(mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"There is a large pile of bricks on my plot."}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(response.get("quantity").isNull()).isTrue();
        assertThat(response.get("price").isNull()).isTrue();
        assertThat(response.get("condition").isNull()).isTrue();
        assertThat(response.get("isFree").isNull()).isTrue();
    }

    @Test
    void understandsFreeWithoutTurningItIntoAPrice() throws Exception {
        providerAnswers("""
                {"title":"Wooden Boards","category":"WOOD","description":"Free wooden boards.","condition":"GOOD",
                 "quantity":null,"quantityUnit":null,"price":null,"isFree":true,"locationText":null}
                """);

        JsonNode response = node(mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"Free wooden boards, anyone who can collect them."}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(response.get("isFree").asBoolean()).isTrue();
        assertThat(response.get("price").decimalValue()).isEqualByComparingTo("0");
        assertThat(response.get("category").asString()).isEqualTo("WOOD");
    }

    @Test
    void rejectsUnknownEnumsAndImpossibleNumbersFromExtraction() throws Exception {
        providerAnswers("""
                {"title":"Something","category":"UNOBTAINIUM","description":"…","condition":"SPARKLY",
                 "quantity":-5,"quantityUnit":"pieces","price":-500,"isFree":null,"locationText":null}
                """);

        JsonNode response = node(mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"Some material of some kind."}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(response.get("category").isNull()).isTrue();
        assertThat(response.get("condition").isNull()).isTrue();
        assertThat(response.get("quantity").isNull()).isTrue();
        assertThat(response.get("price").isNull()).isTrue();
    }

    @Test
    void publishesNothingOnItsOwn() throws Exception {
        providerAnswers("""
                {"title":"Red Clay Bricks","category":"BRICKS","description":"Bricks.","condition":"GOOD",
                 "quantity":300,"quantityUnit":"pieces","price":2000,"isFree":false,"locationText":null}
                """);

        long before = materialRepository.count();

        mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"300 bricks for 2000 rupees, please add this to the marketplace."}
                                """))
                .andExpect(status().isOk());

        assertThat(materialRepository.count()).isEqualTo(before);
    }

    @Test
    void saysSoWhenExtractionIsUnavailable() throws Exception {
        when(aiProvider.completeJson(any(AiPrompt.class)))
                .thenThrow(new AiUnavailableException("server_error", "boom"));

        mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"300 bricks for 2000 rupees."}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value(
                        "AI extraction is temporarily unavailable. Please enter the details manually."))
                .andExpect(jsonPath("$.fallbackAvailable").value(true));
    }

    @Test
    void saysTheSameWhenExtractionAnswersNonsense() throws Exception {
        providerAnswers("Sure! Here are some fields you might like.");

        mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"300 bricks for 2000 rupees."}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(
                        "AI extraction is temporarily unavailable. Please enter the details manually."));
    }

    @Test
    void validatesTheTextItIsGiven() throws Exception {
        mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"  "}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post(EXTRACTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"%s"}
                                """.formatted("bricks ".repeat(300))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void needsAnAccountForExtractionAndGeneration() throws Exception {
        mockMvc.perform(post(EXTRACTION_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"text":"300 bricks for 2000 rupees."}
                                """))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post(DESCRIPTION_URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks"}
                                """))
                .andExpect(status().isUnauthorized());
    }

    // ----------------------------------------------------- §45 - description

    @Test
    void writesADescriptionFromConfirmedFactsOnly() throws Exception {
        providerAnswers("""
                {"description":"Red clay bricks, clean and dry, from a finished compound wall project."}
                """);

        mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks","category":"BRICKS","condition":"GOOD",
                                 "quantity":300,"quantityUnit":"pieces","price":2000,"isFree":false,
                                 "locationText":"Bhimavaram, Andhra Pradesh",
                                 "ownerNote":"Pickup on weekends."}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value(
                        "Red clay bricks, clean and dry, from a finished compound wall project."));

        AiPrompt sent = capturedPrompt();

        assertThat(sent.user()).contains("Material: Red Clay Bricks");
        assertThat(sent.user()).contains("Category: Bricks");
        assertThat(sent.user()).contains("Condition: Good");
        assertThat(sent.user()).contains("Quantity: 300 pieces");
        assertThat(sent.user()).contains("Price: ₹2000");
        assertThat(sent.user()).contains("Where it can be collected: Bhimavaram, Andhra Pradesh");
        // Nothing private travels with the facts.
        assertThat(sent.user()).doesNotContain("ai.tester@example.com");
        assertThat(sent.user()).doesNotContain("StrongPass123");
        assertThat(sent.user()).doesNotContain("+91 90000 00000");
    }

    @Test
    void tellsTheWriterWhenSomethingIsFree() throws Exception {
        providerAnswers("""
                {"description":"Surplus tiles, free to anyone who can collect them."}
                """);

        mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Surplus Tiles","category":"TILES","condition":"GOOD","isFree":true,
                                 "quantity":100,"quantityUnit":"pieces",
                                 "locationText":"Bhimavaram, Andhra Pradesh"}
                                """))
                .andExpect(status().isOk());

        assertThat(capturedPrompt().user()).contains("Price: free");
    }

    @Test
    void keepsAGeneratedDescriptionWithinItsLimit() throws Exception {
        providerAnswers("""
                {"description":"%s"}
                """.formatted("Very good bricks. ".repeat(40)));

        JsonNode response = node(mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(response.get("description").asString()).hasSizeLessThanOrEqualTo(200);
    }

    @Test
    void saysSoWhenDescriptionGenerationIsUnavailable() throws Exception {
        when(aiProvider.completeJson(any(AiPrompt.class)))
                .thenThrow(new AiUnavailableException("not_configured", "no key"));

        mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks"}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(
                        "AI description is temporarily unavailable. Please write the description manually."))
                .andExpect(jsonPath("$.fallbackAvailable").value(true));
    }

    @Test
    void saysTheSameWhenTheWriterReturnsNothing() throws Exception {
        providerAnswers("""
                {"description":null}
                """);

        mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks"}
                                """))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void requiresAMaterialNameBeforeWritingAnything() throws Exception {
        mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"  "}
                                """))
                .andExpect(status().isBadRequest());

        verify(aiProvider, times(0)).completeJson(any(AiPrompt.class));
    }

    @Test
    void capsTheSignedInAiToolsTogether() throws Exception {
        providerAnswers("""
                {"title":"Bricks","category":"BRICKS","description":"Bricks.","condition":null,
                 "quantity":null,"quantityUnit":null,"price":null,"isFree":null,"locationText":null}
                """);

        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post(EXTRACTION_URL)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"text":"a pile of bricks number %d"}
                                    """.formatted(attempt)))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(post(DESCRIPTION_URL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks"}
                                """))
                .andExpect(status().isTooManyRequests());
    }

    private AiPrompt capturedPrompt() {
        ArgumentCaptor<AiPrompt> captor = ArgumentCaptor.forClass(AiPrompt.class);
        verify(aiProvider).completeJson(captor.capture());

        return captor.getValue();
    }
}
