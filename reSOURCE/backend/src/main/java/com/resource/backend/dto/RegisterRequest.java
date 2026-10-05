package com.resource.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/auth/register}.
 */
public record RegisterRequest(

        @NotBlank(message = "Name is required.")
        @Size(min = 2, max = 120, message = "Name must be between 2 and 120 characters.")
        String name,

        @NotBlank(message = "Email is required.")
        @Email(message = "Enter a valid email address.")
        @Size(max = 255, message = "Email must be at most 255 characters.")
        String email,

        @Pattern(regexp = "^[+0-9][0-9\\-\\s]{5,19}$", message = "Enter a valid phone number.")
        String phone,

        @NotBlank(message = "Password is required.")
        @Size(min = 8, max = 72, message = "Password must be between 8 and 72 characters.")
        String password) {
}
