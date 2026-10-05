package com.resource.backend.ai.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

/**
 * A listing described in words, turned into fields - for the owner to review.
 *
 * <p>Quantity and price are only filled in when the text states them; a vague
 * phrase like "a large pile" stays {@code null}. The owner edits and publishes:
 * nothing here is written to the database.</p>
 */
public record ListingExtractionResponse(
        String title,
        MaterialCategory category,
        String categoryLabel,
        String description,
        MaterialCondition condition,
        String conditionLabel,
        BigDecimal quantity,
        String quantityUnit,
        BigDecimal price,
        Boolean isFree,
        String locationText) {
}
