package com.resource.backend.ai;

import java.math.BigDecimal;

import org.springframework.stereotype.Component;

import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Writes a listing description out of facts the owner already confirmed.
 *
 * <p>Only the values passed in are sent - no profile data, no contact details,
 * no other listings - and the prompt forbids inventing anything that is not
 * among them: no certifications, no dimensions, no brand, no manufacturing
 * date, no strength, no quantity and no price the owner did not type. The owner
 * still edits the text before publishing, and if this fails they simply write
 * their own.</p>
 */
@Component
public class DescriptionService {

    private static final String SYSTEM_PROMPT = """
            You write one short, plain marketplace description for surplus construction material.

            Reply with one JSON object and nothing else: {"description": "..."}

            Rules:
            - Use only the facts given to you. Two or three sentences, no marketing language, no emoji.
            - Never invent or mention a quality certificate, exact dimensions, brand, manufacturing date,
              structural strength, quantity, price or location that was not given to you.
            - If the facts are thin, write a short honest description and stop.
            """;

    private final AiProvider aiProvider;
    private final ObjectMapper objectMapper;
    private final AiProperties properties;

    public DescriptionService(AiProvider aiProvider, ObjectMapper objectMapper, AiProperties properties) {
        this.aiProvider = aiProvider;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    /**
     * @param title         the material name the owner typed
     * @param category      the chosen category, may be {@code null}
     * @param condition     the chosen condition, may be {@code null}
     * @param quantity      the amount the owner typed, may be {@code null}
     * @param unit          the unit the owner typed, may be {@code null}
     * @param price         the price the owner typed, may be {@code null}
     * @param isFree        whether the owner marked it free
     * @param locationText  the address or place the owner typed, may be {@code null}
     * @param ownerNote     anything else the owner wrote, may be {@code null}
     */
    public String generate(String title,
                           MaterialCategory category,
                           MaterialCondition condition,
                           BigDecimal quantity,
                           String unit,
                           BigDecimal price,
                           boolean isFree,
                           String locationText,
                           String ownerNote) {

        StringBuilder facts = new StringBuilder();
        facts.append("Material: ").append(title).append('\n');

        if (category != null) {
            facts.append("Category: ").append(category.getLabel()).append('\n');
        }
        if (condition != null) {
            facts.append("Condition: ").append(condition.getLabel()).append('\n');
        }
        if (quantity != null) {
            facts.append("Quantity: ").append(quantity.stripTrailingZeros().toPlainString());
            if (unit != null && !unit.isBlank()) {
                facts.append(' ').append(unit.trim());
            }
            facts.append('\n');
        }
        if (isFree) {
            facts.append("Price: free\n");
        } else if (price != null) {
            facts.append("Price: ₹").append(price.stripTrailingZeros().toPlainString()).append('\n');
        }
        if (locationText != null && !locationText.isBlank()) {
            facts.append("Where it can be collected: ").append(locationText.trim()).append('\n');
        }
        if (ownerNote != null && !ownerNote.isBlank()) {
            facts.append("Owner's extra note: ").append(ownerNote.trim()).append('\n');
        }

        JsonNode raw = AiJson.parseObject(objectMapper,
                aiProvider.completeJson(AiPrompt.text(SYSTEM_PROMPT, facts.toString())));

        String description = AiJson.text(raw, "description");

        if (description == null) {
            throw new AiUnavailableException("malformed_output",
                    "The AI provider returned no description.");
        }

        return description.length() > properties.descriptionMaxLength()
                ? description.substring(0, properties.descriptionMaxLength()).trim()
                : description;
    }
}
