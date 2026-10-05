package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.MaterialStatus;

/**
 * One material in full, for its details page.
 *
 * @param owner   the owner's public identity: id and name only, never contact
 *                details before a request has been accepted
 * @param isOwner whether the caller owns the listing, so the UI can offer
 *                edit, pause and delete; the backend re-checks on every write
 */
public record MaterialDetailResponse(
        Long id,
        String title,
        MaterialCategory category,
        String categoryLabel,
        String description,
        BigDecimal quantity,
        String unit,
        MaterialCondition condition,
        String conditionLabel,
        BigDecimal price,
        boolean isFree,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        String ownerNote,
        List<MaterialPhotoResponse> photos,
        MaterialOwnerResponse owner,
        boolean isOwner,
        Double distanceKm,
        MaterialStatus status,
        Instant createdAt,
        Instant updatedAt) {

    public static MaterialDetailResponse from(Material material, Long viewerId, Double distanceKm) {
        return new MaterialDetailResponse(
                material.getId(),
                material.getTitle(),
                material.getCategory(),
                material.getCategory().getLabel(),
                material.getDescription(),
                material.getQuantity(),
                material.getUnit(),
                material.getCondition(),
                material.getCondition().getLabel(),
                material.getPrice(),
                material.isFree(),
                material.getAddress(),
                material.getLatitude(),
                material.getLongitude(),
                material.getOwnerNote(),
                material.getPhotos().stream().map(MaterialPhotoResponse::from).toList(),
                MaterialOwnerResponse.from(material.getOwner()),
                material.isOwnedBy(viewerId),
                distanceKm,
                material.getStatus(),
                material.getCreatedAt(),
                material.getUpdatedAt());
    }
}
