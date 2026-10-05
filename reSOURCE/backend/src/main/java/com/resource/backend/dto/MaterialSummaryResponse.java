package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.MaterialStatus;

/**
 * One material as shown in the marketplace grid.
 *
 * @param categoryLabel  friendly category name, so the UI never translates enums
 * @param conditionLabel friendly condition name
 * @param distanceKm     distance from the coordinates the caller searched with,
 *                       or {@code null} when the search carried none
 */
public record MaterialSummaryResponse(
        Long id,
        String title,
        MaterialCategory category,
        String categoryLabel,
        BigDecimal quantity,
        String unit,
        MaterialCondition condition,
        String conditionLabel,
        BigDecimal price,
        boolean isFree,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        String primaryImageUrl,
        Double distanceKm,
        MaterialStatus status,
        Instant createdAt) {

    public static MaterialSummaryResponse from(Material material, Double distanceKm) {
        return new MaterialSummaryResponse(
                material.getId(),
                material.getTitle(),
                material.getCategory(),
                material.getCategory().getLabel(),
                material.getQuantity(),
                material.getUnit(),
                material.getCondition(),
                material.getCondition().getLabel(),
                material.getPrice(),
                material.isFree(),
                material.getAddress(),
                material.getLatitude(),
                material.getLongitude(),
                material.primaryImageUrl(),
                distanceKm,
                material.getStatus(),
                material.getCreatedAt());
    }
}
