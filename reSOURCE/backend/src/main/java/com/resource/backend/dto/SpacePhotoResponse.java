package com.resource.backend.dto;

import com.resource.backend.entity.SpacePhoto;

/** One image of a space. */
public record SpacePhotoResponse(Long id, String imageUrl, int displayOrder) {

    public static SpacePhotoResponse from(SpacePhoto photo) {
        return new SpacePhotoResponse(photo.getId(), photo.getImageUrl(), photo.getDisplayOrder());
    }
}
