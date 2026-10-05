package com.resource.backend.dto;

import com.resource.backend.entity.Material;

/**
 * Minimal reference to a material inside a request or a booking summary.
 *
 * <p>{@code null} is returned for a space request, which is how the UI tells the
 * two kinds of request apart.</p>
 */
public record MaterialRef(Long id, String title, String categoryLabel, String primaryImageUrl) {

    public static MaterialRef from(Material material) {
        if (material == null) {
            return null;
        }

        return new MaterialRef(material.getId(), material.getTitle(),
                material.getCategory().getLabel(), material.primaryImageUrl());
    }
}
