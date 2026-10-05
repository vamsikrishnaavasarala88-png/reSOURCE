package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePhoto;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;

/**
 * A space as shown in listings and search results.
 *
 * @param fromPrice       cheapest paid activity, {@code null} when every listed
 *                        activity is free
 * @param freeActivities  labels of the activities the owner marked as free
 * @param distanceKm      distance from the searched point, when one was given
 */
public record SpaceSummaryResponse(
        Long id,
        String title,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal area,
        AreaUnit areaUnit,
        Integer capacity,
        String primaryImageUrl,
        List<String> facilities,
        List<SpacePricingResponse> pricing,
        BigDecimal fromPrice,
        List<String> freeActivities,
        Double distanceKm,
        SpaceStatus status,
        Instant createdAt) {

    public static SpaceSummaryResponse from(Space space, Double distanceKm) {
        List<SpacePricing> pricing = space.getPricing().stream()
                .sorted((left, right) -> left.getActivityType().compareTo(right.getActivityType()))
                .toList();

        BigDecimal fromPrice = pricing.stream()
                .filter(entry -> !entry.isFree())
                .map(SpacePricing::getPrice)
                .min(BigDecimal::compareTo)
                .orElse(null);

        List<String> freeActivities = pricing.stream()
                .filter(SpacePricing::isFree)
                .map(entry -> entry.getActivityType().name())
                .sorted()
                .toList();

        return new SpaceSummaryResponse(
                space.getId(),
                space.getTitle(),
                space.getAddress(),
                space.getLatitude(),
                space.getLongitude(),
                space.getArea(),
                space.getAreaUnit(),
                space.getCapacity(),
                space.getPhotos().stream().findFirst().map(SpacePhoto::getImageUrl).orElse(null),
                space.getFacilities().stream()
                        .map(entry -> entry.getFacility())
                        .sorted()
                        .map(Enum::name)
                        .toList(),
                pricing.stream().map(SpacePricingResponse::from).toList(),
                fromPrice,
                freeActivities,
                distanceKm,
                space.getStatus(),
                space.getCreatedAt());
    }
}
