package com.resource.backend.dto;

import com.resource.backend.entity.User;

/**
 * Public identity of a listing's owner: name only.
 *
 * <p>Phone and email are deliberately absent. They are revealed only once a
 * material request has been accepted, through the request itself.</p>
 */
public record MaterialOwnerResponse(Long id, String name) {

    public static MaterialOwnerResponse from(User user) {
        return new MaterialOwnerResponse(user.getId(), user.getName());
    }
}
