package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

import com.resource.backend.ai.AiPrompt;
import com.resource.backend.ai.AiUnavailableException;
import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialCategory;

import tools.jackson.databind.JsonNode;

/**
 * Material recognition: the AI suggests a name, a category, a condition and a
 * confidence, and the owner decides.
 *
 * <p>The tests that matter most here are the ones about what the answer must not
 * contain - a quantity can never come from a photo - and about the failure
 * paths, because a suggestion feature that blocks listing material would be
 * worse than no suggestion feature at all.</p>
 */
class AiMaterialRecognitionTest extends AiIntelligenceTestSupport {

    private static final String URL = "/api/ai/material-recognition";

    // -------------------------------------------------- §44.1 - a happy path

    @Test
    void suggestsNameCategoryAndConditionWithHighConfidence() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.92}
                """);

        MockMultipartFile image = new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(300, 300));

        mockMvc.perform(multipart(URL).file(image).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.materialName").value("Red Clay Bricks"))
                .andExpect(jsonPath("$.category").value("BRICKS"))
                .andExpect(jsonPath("$.categoryLabel").value("Bricks"))
                .andExpect(jsonPath("$.condition").value("GOOD"))
                .andExpect(jsonPath("$.conditionLabel").value("Good"))
                .andExpect(jsonPath("$.confidence").value(0.92))
                .andExpect(jsonPath("$.confidenceBand").value("HIGH"))
                .andExpect(jsonPath("$.confidenceLabel").value("High confidence"))
                .andExpect(jsonPath("$.confident").value(true))
                .andExpect(jsonPath("$.description").doesNotExist())
                // How much material there is can only come from the owner.
                .andExpect(jsonPath("$.quantity").doesNotExist())
                .andExpect(jsonPath("$.quantityUnit").doesNotExist());
    }

    @Test
    void describesWhatThePhotoShows() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.92,
                 "description":"Neatly stacked red clay bricks,   clean and dry, ready for reuse."}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(300, 300)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description")
                        .value("Neatly stacked red clay bricks, clean and dry, ready for reuse."));
    }

    @Test
    void throwsAwayADescriptionThatStatesAFigure() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.92,
                 "description":"About 300 bricks for Rs 2000, stacked neatly on the roadside."}
                """);

        // A number in a description is a quantity or a price the owner never
        // gave, so the whole description is dropped rather than half-invented.
        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(300, 300)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.materialName").value("Red Clay Bricks"))
                .andExpect(jsonPath("$.description").doesNotExist());
    }

    @Test
    void dropsALowConfidenceDescriptionAlongWithTheRestOfTheSuggestion() throws Exception {
        providerAnswers("""
                {"materialName":"Something","category":null,"condition":null,"confidence":0.2,
                 "description":"A pile of something on the ground."}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "blurry.jpg", "image/jpeg", jpeg(90, 90)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confident").value(false))
                .andExpect(jsonPath("$.description").doesNotExist())
                .andExpect(jsonPath("$.materialName").doesNotExist());
    }

    @Test
    void ignoresAQuantityEvenWhenTheProviderSendsOne() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.9,
                 "quantity":300,"quantityUnit":"pieces"}
                """);

        MockMultipartFile image = new MockMultipartFile("image", "bricks.png", "image/png", png(120, 120));

        JsonNode response = node(mockMvc.perform(multipart(URL).file(image)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(response.has("quantity")).isFalse();
        assertThat(response.has("quantityUnit")).isFalse();
    }

    @Test
    void aSuggestedCategoryStillNeedsAnOwnerTypedQuantity() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.95}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(200, 200)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk());

        // The owner accepts the suggestion and types the amount themselves.
        mockMvc.perform(post("/api/materials")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Red Clay Bricks","category":"BRICKS","quantity":300,"unit":"pieces",
                                 "condition":"GOOD","isFree":false,"price":2000,
                                 "address":"Bhimavaram, Andhra Pradesh",
                                 "description":"Surplus bricks from a compound wall."}
                                """))
                .andExpect(status().isCreated());

        Material saved = materialRepository.findAll().get(0);

        assertThat(saved.getQuantity()).isEqualByComparingTo("300");
        assertThat(saved.getCategory()).isEqualTo(MaterialCategory.BRICKS);
    }

    // ------------------------------------------------------ §16 - confidence

    @Test
    void callsALowConfidenceAnswerWhatItIs() throws Exception {
        providerAnswers("""
                {"materialName":null,"category":null,"condition":null,"confidence":0.3}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "blur.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confidenceBand").value("LOW"))
                .andExpect(jsonPath("$.confidenceLabel").value("Low confidence — please verify"))
                .andExpect(jsonPath("$.confident").value(false))
                .andExpect(jsonPath("$.message").value(
                        "Couldn't confidently identify this material. Please select the category manually."));
    }

    @Test
    void callsAMiddlingAnswerAPossibleMatch() throws Exception {
        providerAnswers("""
                {"materialName":"Concrete Blocks","category":"CEMENT","condition":"USED","confidence":0.62}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "blocks.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confidenceBand").value("MEDIUM"))
                .andExpect(jsonPath("$.confidenceLabel").value("Possible match"))
                .andExpect(jsonPath("$.confident").value(true))
                .andExpect(jsonPath("$.message").doesNotExist());
    }

    @Test
    void readsAPercentageConfidenceAsAFraction() throws Exception {
        providerAnswers("""
                {"materialName":"Steel Pipes","category":"PIPES","condition":"GOOD","confidence":94}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "pipes.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confidence").value(0.94))
                .andExpect(jsonPath("$.confidenceBand").value("HIGH"));
    }

    @Test
    void keepsAUsefulNameEvenWhenTheCategoryIsUnknown() throws Exception {
        providerAnswers("""
                {"materialName":"Pile of gravel","category":"ALIEN_METAL","condition":"SHINY","confidence":0.8}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "gravel.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").doesNotExist())
                .andExpect(jsonPath("$.condition").doesNotExist())
                .andExpect(jsonPath("$.materialName").value("Pile of gravel"))
                .andExpect(jsonPath("$.confident").value(true));
    }

    // ------------------------------------------------- §18 - image handling

    @Test
    void refusesAFileThatIsNotAnImageWhateverItIsCalled() throws Exception {
        MockMultipartFile notAnImage = new MockMultipartFile("image", "bricks.png", "image/png",
                "this is plain text pretending to be a photo".getBytes());

        mockMvc.perform(multipart(URL).file(notAnImage).header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only JPEG, PNG and WebP images can be analyzed."));

        verify(aiProvider, times(0)).completeJson(any(AiPrompt.class));
    }

    @Test
    void refusesABrokenImage() throws Exception {
        byte[] broken = new byte[512];
        new Random(7).nextBytes(broken);
        // A real JPEG magic number on top of bytes that are not a JPEG.
        broken[0] = (byte) 0xFF;
        broken[1] = (byte) 0xD8;
        broken[2] = (byte) 0xFF;

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "broken.jpg", "image/jpeg", broken))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("That image could not be read. Please try another one."));
    }

    @Test
    void refusesAnImageAboveTheConfiguredSize() throws Exception {
        byte[] tooBig = new byte[70_000];
        tooBig[0] = (byte) 0xFF;
        tooBig[1] = (byte) 0xD8;
        tooBig[2] = (byte) 0xFF;

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "huge.jpg", "image/jpeg", tooBig))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("That image is larger than 64 KB")));
    }

    @Test
    void refusesAnImageWithAbsurdDimensions() throws Exception {
        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "wide.jpg", "image/jpeg", jpeg(8200, 8)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("larger than 8000 pixels")));
    }

    @Test
    void shrinksALargeImageBeforeSendingIt() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.9}
                """);

        byte[] original = jpeg(400, 200);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", original))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk());

        AiPrompt sent = capturedPrompt();
        BufferedImage sentImage = ImageIO.read(new java.io.ByteArrayInputStream(sent.image().bytes()));

        assertThat(sent.image().mimeType()).isEqualTo("image/jpeg");
        assertThat(Math.max(sentImage.getWidth(), sentImage.getHeight())).isLessThanOrEqualTo(64);
        assertThat(sent.image().bytes()).isNotEqualTo(original);
    }

    @Test
    void leavesAnImageThatIsAlreadySmallAlone() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.9}
                """);

        byte[] original = jpeg(40, 40);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "small.jpg", "image/jpeg", original))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk());

        assertThat(capturedPrompt().image().bytes()).isEqualTo(original);
    }

    @Test
    void acceptsAWebpImage() throws Exception {
        providerAnswers("""
                {"materialName":"Wooden Boards","category":"WOOD","condition":"GOOD","confidence":0.85}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "boards.webp", "image/webp", webp(100, 50)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.category").value("WOOD"));

        assertThat(capturedPrompt().image().mimeType()).isEqualTo("image/webp");
    }

    @Test
    void sendsNothingAboutTheUserWithTheImage() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.9}
                """);

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk());

        AiPrompt sent = capturedPrompt();

        assertThat(sent.user()).doesNotContain("ai.tester@example.com");
        assertThat(sent.user()).doesNotContain("StrongPass123");
        assertThat(sent.user()).doesNotContain("+91 90000 00000");
        assertThat(sent.system()).doesNotContain("ai.tester@example.com");
    }

    // ------------------------------------------------------- §44.4 - failures

    @Test
    void saysSoWhenTheProviderIsUnavailable() throws Exception {
        when(aiProvider.completeJson(any(AiPrompt.class)))
                .thenThrow(new AiUnavailableException("timeout", "too slow"));

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value(
                        "AI recognition is temporarily unavailable. Please select the category manually."))
                .andExpect(jsonPath("$.fallbackAvailable").value(true));
    }

    @Test
    void saysSoWhenTheProviderAnswersNonsense() throws Exception {
        providerAnswers("probably bricks, I think? maybe tiles?");

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.fallbackAvailable").value(true));
    }

    @Test
    void needsAnAccountAndAnImage() throws Exception {
        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(120, 120))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "", "image/jpeg", new byte[0]))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Choose an image to analyze."));
    }

    @Test
    void capsHowOftenOneAccountCanAskForRecognition() throws Exception {
        providerAnswers("""
                {"materialName":"Red Clay Bricks","category":"BRICKS","condition":"GOOD","confidence":0.9}
                """);

        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(multipart(URL)
                            .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(120, 120)))
                            .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(multipart(URL)
                        .file(new MockMultipartFile("image", "bricks.jpg", "image/jpeg", jpeg(120, 120)))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.fallbackAvailable").value(true));
    }

    // ---------------------------------------------------------------- helpers

    private AiPrompt capturedPrompt() {
        ArgumentCaptor<AiPrompt> captor = ArgumentCaptor.forClass(AiPrompt.class);
        verify(aiProvider).completeJson(captor.capture());

        return captor.getValue();
    }

    private static byte[] jpeg(int width, int height) throws IOException {
        return encode(painted(width, height), "jpg");
    }

    private static byte[] png(int width, int height) throws IOException {
        return encode(painted(width, height), "png");
    }

    private static BufferedImage painted(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(new Color(184, 84, 60));
        graphics.fillRect(0, 0, width, height);
        graphics.setColor(new Color(60, 60, 60));

        for (int x = 0; x < width; x += 8) {
            graphics.drawLine(x, 0, x, height);
        }

        graphics.dispose();

        return image;
    }

    private static byte[] encode(BufferedImage image, String format) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);

        return out.toByteArray();
    }

    /**
     * A minimal WebP container (RIFF/WEBP/VP8X) with a declared canvas size.
     *
     * <p>The JDK cannot decode WebP, so the validator reads the header instead -
     * which is exactly what this test exercises.</p>
     */
    private static byte[] webp(int width, int height) {
        byte[] bytes = new byte[40];
        write(bytes, 0, "RIFF");
        writeInt(bytes, 4, bytes.length - 8);
        write(bytes, 8, "WEBP");
        write(bytes, 12, "VP8X");
        writeInt(bytes, 16, 10);
        writeInt(bytes, 20, 0);
        writeInt24(bytes, 24, width - 1);
        writeInt24(bytes, 27, height - 1);

        return bytes;
    }

    private static void write(byte[] target, int offset, String text) {
        for (int index = 0; index < text.length(); index++) {
            target[offset + index] = (byte) text.charAt(index);
        }
    }

    private static void writeInt(byte[] target, int offset, int value) {
        target[offset] = (byte) (value & 0xff);
        target[offset + 1] = (byte) ((value >> 8) & 0xff);
        target[offset + 2] = (byte) ((value >> 16) & 0xff);
        target[offset + 3] = (byte) ((value >> 24) & 0xff);
    }

    private static void writeInt24(byte[] target, int offset, int value) {
        target[offset] = (byte) (value & 0xff);
        target[offset + 1] = (byte) ((value >> 8) & 0xff);
        target[offset + 2] = (byte) ((value >> 16) & 0xff);
    }
}
