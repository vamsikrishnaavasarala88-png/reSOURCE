package com.resource.backend.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.MaterialStatus;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code PUT /api/materials/{id}}.
 *
 * <p>The same fields as creation, plus {@code status} so the owner can pause or
 * resume a listing. The owner is always the authenticated user and is verified
 * in the service; an owner id in the body is ignored.</p>
 */
public record UpdateMaterialRequest(

        @NotBlank(message = "Title is required.")
        @Size(min = 3, max = 160, message = "Title must be between 3 and 160 characters.")
        String title,

        @NotNull(message = "Choose a category.")
        MaterialCategory category,

        @NotBlank(message = "Description is required.")
        @Size(min = 10, max = 2000, message = "Description must be between 10 and 2000 characters.")
        String description,

        @NotNull(message = "Quantity is required.")
        @DecimalMin(value = "0.0", inclusive = false, message = "Quantity must be greater than 0.")
        @Digits(integer = 10, fraction = 2, message = "Quantity must have at most 2 decimal places.")
        BigDecimal quantity,

        @NotBlank(message = "Unit is required.")
        @Size(max = 40, message = "Unit must be at most 40 characters.")
        String unit,

        @NotNull(message = "Choose the condition of the material.")
        MaterialCondition condition,

        @NotNull(message = "Enter a price, or mark the material as free.")
        @DecimalMin(value = "0.0", message = "Price cannot be negative.")
        @Digits(integer = 10, fraction = 2, message = "Price must have at most 2 decimal places.")
        BigDecimal price,

        @NotNull(message = "Say whether the material is free.")
        Boolean isFree,

        @NotBlank(message = "Address is required.")
        @Size(max = 300, message = "Address must be at most 300 characters.")
        String address,

        @DecimalMin(value = "-90.0", message = "Latitude must be between -90 and 90.")
        @DecimalMax(value = "90.0", message = "Latitude must be between -90 and 90.")
        @Digits(integer = 3, fraction = 6, message = "Latitude must have at most 6 decimal places.")
        BigDecimal latitude,

        @DecimalMin(value = "-180.0", message = "Longitude must be between -180 and 180.")
        @DecimalMax(value = "180.0", message = "Longitude must be between -180 and 180.")
        @Digits(integer = 3, fraction = 6, message = "Longitude must have at most 6 decimal places.")
        BigDecimal longitude,

        @Size(max = 1000, message = "Owner note must be at most 1000 characters.")
        String ownerNote,

        MaterialStatus status) {
}
