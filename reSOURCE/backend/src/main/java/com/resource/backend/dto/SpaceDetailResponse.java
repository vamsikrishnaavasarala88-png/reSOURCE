package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpaceFacility;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;

/**
 * Full space payload for the details page.
 *
 * @param isOwner true when the requester owns the listing, so the UI can show
 *                edit/delete; the backend re-checks ownership on every mutation
 */
public record SpaceDetailResponse(
        Long id,
        String title,
        String description,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal area,
        AreaUnit areaUnit,
        Integer capacity,
        String availability,
        String ownerNote,
        List<SpacePhotoResponse> photos,
        List<String> facilities,
        List<SpacePricingResponse> pricing,
        BigDecimal fromPrice,
        List<String> freeActivities,
        Double distanceKm,
        SpaceOwnerResponse owner,
        boolean isOwner,
        SpaceStatus status,
        Instant createdAt,
        Instant updatedAt) {

    public static SpaceDetailResponse from(Space space, Long viewerId, Double distanceKm) {
        List<SpacePricing> pricing = space.getPricing().stream()
                .sorted((left, right) -> left.getActivityType().compareTo(right.getActivityType()))
                .toList();

        BigDecimal fromPrice = pricing.stream()
                .filter(entry -> !entry.isFree())
                .map(SpacePricing::getPrice)
                .min(BigDecimal::compareTo)
                .orElse(null);

        return new SpaceDetailResponse(
                space.getId(),
                space.getTitle(),
                space.getDescription(),
                space.getAddress(),
                space.getLatitude(),
                space.getLongitude(),
                space.getArea(),
                space.getAreaUnit(),
                space.getCapacity(),
                space.getAvailability(),
                space.getOwnerNote(),
                space.getPhotos().stream().map(SpacePhotoResponse::from).toList(),
                // Enum names, not labels: these values are sent back on update.
                space.getFacilities().stream()
                        .map(SpaceFacility::getFacility)
                        .sorted()
                        .map(Enum::name)
                        .toList(),
                pricing.stream().map(SpacePricingResponse::from).toList(),
                fromPrice,
                pricing.stream()
                        .filter(SpacePricing::isFree)
                        .map(entry -> entry.getActivityType().name())
                        .sorted()
                        .toList(),
                distanceKm,
                SpaceOwnerResponse.from(space.getOwner()),
                space.isOwnedBy(viewerId),
                space.getStatus(),
                space.getCreatedAt(),
                space.getUpdatedAt());
    }
}
