package com.resource.backend.ai.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.ResourceType;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * One natural-language search.
 *
 * <p>{@code resourceType} is the marketplace the visitor is looking at: the page
 * decides the context, and the AI only fills in the criteria. {@code latitude}
 * and {@code longitude} are the browser's own position, used only to answer
 * "near me" questions - they are never sent to the provider.</p>
 *
 * @param searchQuery  what the visitor typed
 * @param resourceType which marketplace to search
 * @param latitude     optional, from the browser
 * @param longitude    optional, from the browser
 * @param page         zero-based page number
 * @param size         page size
 */
public record AiSearchRequest(
        @NotBlank(message = "Describe what you are looking for.")
        @Size(max = 300, message = "Please keep the search under 300 characters.")
        String searchQuery,

        @NotNull(message = "A marketplace must be selected.")
        ResourceType resourceType,

        @DecimalMin(value = "-90", message = "Latitude is out of range.")
        @DecimalMax(value = "90", message = "Latitude is out of range.")
        BigDecimal latitude,

        @DecimalMin(value = "-180", message = "Longitude is out of range.")
        @DecimalMax(value = "180", message = "Longitude is out of range.")
        BigDecimal longitude,

        Integer page,

        Integer size) {

    public int pageIndex() {
        return page == null || page < 0 ? 0 : page;
    }

    public int pageSize(int fallback) {
        if (size == null || size < 1) {
            return fallback;
        }

        return Math.min(size, 50);
    }

    /** Coordinates are all-or-nothing; a lone latitude means nothing. */
    public boolean hasCoordinates() {
        return latitude != null && longitude != null;
    }
}
