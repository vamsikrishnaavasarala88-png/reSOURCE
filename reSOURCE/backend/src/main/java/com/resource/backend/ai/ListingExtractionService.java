package com.resource.backend.ai;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.resource.backend.ai.dto.ListingExtractionResponse;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Reads a listing described in plain words and proposes fields for it.
 *
 * <p>Unlike image recognition, text extraction may pick up a quantity - but only
 * when the owner actually wrote one down. "I have 300 bricks" gives
 * {@code 300}; "a large pile of bricks" gives {@code null}. The same rule holds
 * for the price: it is taken only when stated, and "free bricks" sets
 * {@code isFree} instead. The result is a proposal the owner edits and confirms;
 * this class never writes anything.</p>
 */
@Component
public class ListingExtractionService {

    private static final int MAX_TITLE_LENGTH = 160;
    private static final int MAX_DESCRIPTION_LENGTH = 2000;
    private static final int MAX_UNIT_LENGTH = 20;
    private static final int MAX_LOCATION_LENGTH = 120;
    private static final BigDecimal MAX_PRICE = new BigDecimal("100000000");

    private static final String SYSTEM_PROMPT = """
            You turn an owner's own description of surplus material into listing fields.

            Reply with one JSON object and nothing else:
            {"title": null, "category": null, "description": null, "condition": null,
             "quantity": null, "quantityUnit": null, "price": null, "isFree": null, "locationText": null}

            Rules:
            - title: a short name for the material, taken from the owner's words.
            - category: exactly one of %s, or null.
            - condition: exactly one of %s, but only when the owner described it. Never guess it.
            - description: one or two clean sentences using only what the owner said.
            - quantity: a number, only when the owner stated an amount ("300 bricks" -> 300). Words like
              "a large pile", "some" or "a few" mean null. Never estimate or invent a quantity.
            - quantityUnit: the unit the owner implied, for example pieces, bags, kg, tonnes, boards.
            - price: a number of rupees, only when the owner stated a price. Never invent one.
            - isFree: true only when the owner said it is free, otherwise null.
            - locationText: the place the owner named, as written, or null.
            - Anything the owner did not say stays null.
            """.formatted(
            String.join(", ", Arrays.stream(MaterialCategory.values()).map(Enum::name).toList()),
            String.join(", ", Arrays.stream(MaterialCondition.values()).map(Enum::name).toList()));

    private static final String USER_PROMPT_PREFIX = "The owner wrote:\n";

    private final AiProvider aiProvider;
    private final ObjectMapper objectMapper;

    public ListingExtractionService(AiProvider aiProvider, ObjectMapper objectMapper) {
        this.aiProvider = aiProvider;
        this.objectMapper = objectMapper;
    }

    public ListingExtractionResponse extract(String text) {
        JsonNode raw = AiJson.parseObject(objectMapper,
                aiProvider.completeJson(AiPrompt.text(SYSTEM_PROMPT, USER_PROMPT_PREFIX + text)));

        MaterialCategory category = enumValue(MaterialCategory.class, AiJson.text(raw, "category"));
        MaterialCondition condition = enumValue(MaterialCondition.class, AiJson.text(raw, "condition"));

        Boolean isFree = AiJson.bool(raw, "isFree");

        // A free listing has no price; a stated price is never overridden by a guess.
        BigDecimal price = positive(AiJson.number(raw, "price"));
        if (Boolean.TRUE.equals(isFree)) {
            price = BigDecimal.ZERO;
        }

        return new ListingExtractionResponse(
                shortText(AiJson.text(raw, "title"), MAX_TITLE_LENGTH),
                category,
                category == null ? null : category.getLabel(),
                shortText(AiJson.text(raw, "description"), MAX_DESCRIPTION_LENGTH),
                condition,
                condition == null ? null : condition.getLabel(),
                positive(AiJson.number(raw, "quantity")),
                shortText(AiJson.text(raw, "quantityUnit"), MAX_UNIT_LENGTH),
                price,
                isFree,
                shortText(AiJson.text(raw, "locationText"), MAX_LOCATION_LENGTH));
    }

    private static BigDecimal positive(BigDecimal value) {
        if (value == null || value.signum() <= 0 || value.compareTo(MAX_PRICE) > 0) {
            return null;
        }

        return value;
    }

    private static String shortText(String value, int maxLength) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();

        if (trimmed.isEmpty()) {
            return null;
        }

        return trimmed.length() > maxLength ? trimmed.substring(0, maxLength) : trimmed;
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
