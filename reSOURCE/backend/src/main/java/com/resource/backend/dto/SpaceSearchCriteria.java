package com.resource.backend.dto;

import java.math.BigDecimal;
import java.util.List;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;

/**
 * Filters accepted by {@code GET /api/spaces} and {@code GET /api/spaces/search}.
 *
 * @param q            free text matched against title, description and address
 * @param activity     activity the space must support
 * @param maxPrice     maximum price per activity; {@code 0} means free only
 * @param minCapacity  minimum number of people
 * @param minAreaSqft  lower bound of the normalised area, in square feet
 * @param maxAreaSqft  upper bound of the normalised area, in square feet
 * @param facilities   facilities the space must offer (all of them)
 * @param latitude     centre of the distance search
 * @param longitude    centre of the distance search
 * @param radiusKm     maximum distance from the centre
 * @param sort         {@code newest} (default), {@code priceAsc}, {@code capacityDesc},
 *                     {@code areaDesc} or {@code distance} (needs latitude/longitude)
 */
public record SpaceSearchCriteria(
        String q,
        ActivityType activity,
        BigDecimal maxPrice,
        Integer minCapacity,
        BigDecimal minAreaSqft,
        BigDecimal maxAreaSqft,
        List<Facility> facilities,
        BigDecimal latitude,
        BigDecimal longitude,
        Double radiusKm,
        String sort,
        int page,
        int size) {
}
