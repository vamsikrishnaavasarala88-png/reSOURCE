package com.resource.backend.dto;

/**
 * Successful login payload: the JWT plus the authenticated user.
 */
public record AuthResponse(String accessToken, String tokenType, UserResponse user) {

    public static AuthResponse bearer(String accessToken, UserResponse user) {
        return new AuthResponse(accessToken, "Bearer", user);
    }
}
