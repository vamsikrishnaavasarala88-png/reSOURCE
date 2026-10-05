package com.resource.backend.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.SpaceStatus;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code PUT /api/spaces/{id}}. Same fields as creation plus the
 * listing status, which may be ACTIVE or INACTIVE (deleting has its own
 * endpoint).
 */
public record UpdateSpaceRequest(

        @NotBlank(message = "Title is required.")
        @Size(min = 3, max = 160, message = "Title must be between 3 and 160 characters.")
        String title,

        @NotBlank(message = "Description is required.")
        @Size(min = 10, max = 2000, message = "Description must be between 10 and 2000 characters.")
        String description,

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

        @NotNull(message = "Area is required.")
        @DecimalMin(value = "0.0", inclusive = false, message = "Area must be greater than 0.")
        @Digits(integer = 10, fraction = 2, message = "Area must have at most 2 decimal places.")
        BigDecimal area,

        @NotNull(message = "Area unit is required.")
        AreaUnit areaUnit,

        @NotNull(message = "Capacity is required.")
        @Min(value = 1, message = "Capacity must be greater than 0.")
        @Max(value = 1_000_000, message = "Capacity looks too large.")
        Integer capacity,

        @Size(max = 500, message = "Availability must be at most 500 characters.")
        String availability,

        @Size(max = 1000, message = "Owner note must be at most 1000 characters.")
        String ownerNote,

        Set<Facility> facilities,

        @NotEmpty(message = "Select at least one activity.")
        @Size(max = 20, message = "Too many activities selected.")
        List<@Valid SpacePricingRequest> pricing,

        SpaceStatus status) {
}
