package com.resource.backend.dto;

import com.resource.backend.entity.User;

/**
 * Public identity of one party of a request: name only.
 *
 * <p>Phone and email are deliberately absent - they are returned separately, and
 * only once a request has been accepted and a booking confirmed.</p>
 */
public record RequestParty(Long id, String name) {

    public static RequestParty from(User user) {
        return new RequestParty(user.getId(), user.getName());
    }
}
