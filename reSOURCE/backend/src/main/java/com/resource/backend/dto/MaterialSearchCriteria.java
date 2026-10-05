package com.resource.backend.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

/**
 * Filters accepted by {@code GET /api/materials}.
 *
 * @param q          free text matched against title, description and address
 * @param category   material category the listing must have
 * @param condition  condition the owner stated
 * @param minQuantity lower bound of the available quantity
 * @param unit       the unit {@code minQuantity} is counted in; required
 *                   whenever {@code minQuantity} is set, because quantities in
 *                   different units are never comparable
 * @param maxPrice   maximum price; {@code 0} means free only
 * @param freeOnly   keep only material the owner offers for free
 * @param latitude   centre of the distance search
 * @param longitude  centre of the distance search
 * @param radiusKm   maximum distance from the centre
 * @param sort       {@code newest} (default), {@code priceAsc} or {@code priceDesc}
 */
public record MaterialSearchCriteria(
        String q,
        MaterialCategory category,
        MaterialCondition condition,
        BigDecimal minQuantity,
        String unit,
        BigDecimal maxPrice,
        boolean freeOnly,
        BigDecimal latitude,
        BigDecimal longitude,
        Double radiusKm,
        String sort,
        int page,
        int size) {
}
