package com.resource.backend.dto;

import com.resource.backend.entity.User;

/**
 * Public identity of a listing's owner.
 *
 * <p>Only the display name is exposed: email and phone are private and contact
 * details are revealed in a later phase, after a request is accepted.</p>
 */
public record SpaceOwnerResponse(Long id, String name) {

    public static SpaceOwnerResponse from(User owner) {
        return new SpaceOwnerResponse(owner.getId(), owner.getName());
    }
}
