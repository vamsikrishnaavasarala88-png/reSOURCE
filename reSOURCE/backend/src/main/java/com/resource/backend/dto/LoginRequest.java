package com.resource.backend.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Body of {@code POST /api/auth/login}.
 */
public record LoginRequest(

        @NotBlank(message = "Email is required.")
        String email,

        @NotBlank(message = "Password is required.")
        String password) {
}
