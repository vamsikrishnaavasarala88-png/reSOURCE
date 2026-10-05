package com.resource.backend.dto;

import com.resource.backend.entity.User;

/**
 * Contact details of one party of a confirmed booking.
 *
 * <p>Only ever built for a viewer who is allowed to see them: the phone and
 * email are private until a request is accepted, and unrelated users never
 * receive them at all. The password hash is never part of this or any other
 * response.</p>
 */
public record ContactDetails(Long userId, String name, String phone, String email) {

    public static ContactDetails of(User user) {
        return new ContactDetails(user.getId(), user.getName(), user.getPhone(), user.getEmail());
    }
}
