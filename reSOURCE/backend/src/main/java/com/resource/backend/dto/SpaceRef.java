package com.resource.backend.dto;

import com.resource.backend.entity.Space;

/**
 * Minimal reference to a space, for request and booking responses.
 *
 * <p>{@code null} is returned for a material request, which is how the UI tells
 * the two kinds of request apart.</p>
 */
public record SpaceRef(Long id, String title, String address) {

    public static SpaceRef from(Space space) {
        if (space == null) {
            return null;
        }

        return new SpaceRef(space.getId(), space.getTitle(), space.getAddress());
    }
}
