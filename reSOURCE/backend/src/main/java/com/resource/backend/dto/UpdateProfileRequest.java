package com.resource.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code PUT /api/users/me}.
 *
 * <p>Passwords are not editable here: a dedicated, verified password change
 * flow arrives in a later phase.</p>
 */
public record UpdateProfileRequest(

        @NotBlank(message = "Name is required.")
        @Size(min = 2, max = 120, message = "Name must be between 2 and 120 characters.")
        String name,

        @NotBlank(message = "Email is required.")
        @Email(message = "Enter a valid email address.")
        @Size(max = 255, message = "Email must be at most 255 characters.")
        String email,

        @Pattern(regexp = "^[+0-9][0-9\\-\\s]{5,19}$", message = "Enter a valid phone number.")
        String phone) {
}
