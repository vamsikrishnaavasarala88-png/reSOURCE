package com.resource.backend.dto;

import com.resource.backend.entity.User;

/**
 * A user as returned by the API. Never contains the password hash.
 */
public record UserResponse(Long id, String name, String email, String phone, String role) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhone(),
                user.getRole().name());
    }
}
