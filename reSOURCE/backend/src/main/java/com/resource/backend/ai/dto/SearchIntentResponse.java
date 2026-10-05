package com.resource.backend.ai.dto;

import com.resource.backend.entity.ResourceType;

/**
 * What the search endpoint answers with.
 *
 * @param resourceType         the marketplace the results come from - the one the page asked for
 * @param detectedResourceType what the AI thought the words were about, when that differs
 *                             from {@code resourceType}; the UI uses it for a "did you mean the
 *                             other marketplace?" hint and never filters by it
 * @param intent               the validated, structured filters that were actually applied
 * @param chips                human-readable labels for the UI, e.g. {@code ["Blood Donation Camp", "Free", "200 people"]}
 * @param summary              one line the UI can show as-is, e.g. {@code "Showing spaces matching: Free · 200 people"}
 * @param note                 what had to be relaxed to find these listings, or {@code null} when
 *                             everything the visitor asked for was applied
 */
public record SearchIntentResponse(
        ResourceType resourceType,
        ResourceType detectedResourceType,
        SearchIntent intent,
        java.util.List<String> chips,
        String summary,
        String note) {
}
