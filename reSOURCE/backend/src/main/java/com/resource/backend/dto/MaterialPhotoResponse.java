package com.resource.backend.dto;

import com.resource.backend.entity.MaterialPhoto;

/** One image in a material gallery. */
public record MaterialPhotoResponse(Long id, String imageUrl, int displayOrder) {

    public static MaterialPhotoResponse from(MaterialPhoto photo) {
        return new MaterialPhotoResponse(photo.getId(), photo.getImageUrl(), photo.getDisplayOrder());
    }
}
