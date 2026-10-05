package com.resource.backend.ai;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.resource.backend.ai.dto.MaterialRecognitionResponse;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Identifies surplus material from a photo - as a suggestion only.
 *
 * <p>The prompt asks for a material name, a category, a condition, a confidence
 * and a short description of what is visible. It never asks how much there is:
 * a photo of a pile cannot tell anyone that there are exactly 347 bricks, and
 * the amount is the owner's to type. If the provider sends a quantity anyway, it
 * is ignored here, and the description is rejected outright if it mentions a
 * number the owner never gave.</p>
 */
@Component
public class MaterialRecognitionService {

    static final String LOW_CONFIDENCE_MESSAGE =
            "Couldn't confidently identify this material. Please select the category manually.";

    private static final String SYSTEM_PROMPT = """
            You identify surplus construction material from a photo.

            Reply with one JSON object and nothing else:
            {"materialName": null, "category": null, "condition": null, "confidence": null, "description": null}

            Rules:
            - materialName: a short plain name, for example "Red Clay Bricks", "Cement Bags", "Metal Pipes".
            - category: exactly one of %s, or null when unsure.
            - condition: exactly one of %s, judged only from what is visible (New, Good, Used, Damaged), or null.
            - confidence: a number from 0 to 1 for your classification, honest about uncertainty.
            - description: one or two short plain sentences about what the photo shows, for a listing.
              Describe only what is visible: the material, its apparent condition, colour or shape,
              packaging, and how it is stacked or stored. Write it in the voice of the owner who is
              giving the material away.
            - Never state or estimate a quantity, a price, a brand, dimensions, weight, age,
              certifications or structural strength. Any figure the owner did not give is forbidden.
            - If the photo is unclear, not a material, or you are unsure, return nulls and a low confidence.
            """.formatted(
            String.join(", ", Arrays.stream(MaterialCategory.values()).map(Enum::name).toList()),
            String.join(", ", Arrays.stream(MaterialCondition.values()).map(Enum::name).toList()));

    private static final String USER_PROMPT =
            "Identify the material in this photo. Answer with the JSON object only.";

    private final AiProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final AiProperties properties;

    public MaterialRecognitionService(AiProvider aiProvider, ObjectMapper objectMapper,
            AiProperties properties) {
        this.aiProvider = aiProvider;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    /** Calls the multimodal provider with one validated, downscaled image. */
    public MaterialRecognitionResponse recognize(byte[] imageBytes, String mimeType) {
        JsonNode raw = AiJson.parseObject(objectMapper,
                aiProvider.completeJson(AiPrompt.withImage(SYSTEM_PROMPT, USER_PROMPT, imageBytes, mimeType)));

        String materialName = AiJson.text(raw, "materialName");
        MaterialCategory category = enumValue(MaterialCategory.class, AiJson.text(raw, "category"));
        MaterialCondition condition = enumValue(MaterialCondition.class, AiJson.text(raw, "condition"));

        // Quantity is deliberately not read, even when the provider sends it.
        double confidence = confidence(AiJson.number(raw, "confidence"));

        boolean confident = confidence >= properties.confidenceMedium()
                && (category != null || materialName != null);

        return new MaterialRecognitionResponse(
                confident ? materialName : null,
                category,
                category == null ? null : category.getLabel(),
                condition,
                condition == null ? null : condition.getLabel(),
                confident ? description(AiJson.text(raw, "description")) : null,
                confidence,
                band(confidence),
                bandLabel(confidence),
                confident,
                confident ? null : LOW_CONFIDENCE_MESSAGE);
    }

    /**
     * Cleans the suggested description: collapsed whitespace, no over-long
     * answer (the form has to stay usable), and nothing at all when it contains
     * a figure the owner never typed - a number in a description reads as a
     * quantity or a price, and the AI has no business stating either.
     */
    String description(String raw) {
        if (raw == null) {
            return null;
        }

        String cleaned = raw.strip().replaceAll("\\s+", " ");

        if (cleaned.isEmpty() || cleaned.length() > properties.descriptionMaxLength()) {
            return null;
        }

        return cleaned.matches(".*\\d.*") ? null : cleaned;
    }

    /** {@code HIGH} at or above the configured high threshold, {@code MEDIUM} above the low one. */
    String band(double confidence) {
        if (confidence >= properties.confidenceHigh()) {
            return "HIGH";
        }

        return confidence >= properties.confidenceMedium() ? "MEDIUM" : "LOW";
    }

    String bandLabel(double confidence) {
        return switch (band(confidence)) {
            case "HIGH" -> "High confidence";
            case "MEDIUM" -> "Possible match";
            default -> "Low confidence — please verify";
        };
    }

    /** Missing, out-of-range or unparsable confidence is treated as no confidence at all. */
    private static double confidence(BigDecimal raw) {
        if (raw == null) {
            return 0;
        }

        double value = raw.doubleValue();

        // Providers sometimes answer 94 instead of 0.94.
        if (value > 1 && value <= 100) {
            value = value / 100;
        }

        return Math.max(0, Math.min(1, value));
    }

    private static <E extends Enum<E>> E enumValue(Class<E> type, String raw) {
        if (raw == null) {
            return null;
        }

        try {
            return Enum.valueOf(type, raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
