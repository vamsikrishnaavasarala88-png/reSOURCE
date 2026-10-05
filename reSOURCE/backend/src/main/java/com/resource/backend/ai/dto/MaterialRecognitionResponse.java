package com.resource.backend.ai.dto;

import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

/**
 * What the AI thinks a photo shows - a suggestion for the owner to accept, edit
 * or ignore.
 *
 * <p>There is deliberately no quantity field here, and a quantity in the
 * provider's answer is dropped: how much material there is can only come from
 * the person listing it. The description, when there is one, only repeats what
 * the photo shows - it can never contain a quantity, a price or a fact the
 * owner did not state.</p>
 *
 * @param description    a short description of what is visible, or {@code null}
 * @param confidenceBand {@code HIGH}, {@code MEDIUM} or {@code LOW}
 * @param confident      true when the band is not {@code LOW}; the UI shows the manual path otherwise
 * @param message        wording the UI may show verbatim, or {@code null} when everything is certain
 */
public record MaterialRecognitionResponse(
        String materialName,
        MaterialCategory category,
        String categoryLabel,
        MaterialCondition condition,
        String conditionLabel,
        String description,
        double confidence,
        String confidenceBand,
        String confidenceLabel,
        boolean confident,
        String message) {
}
