package com.resource.backend.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.ActivityType;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Price of a space for one activity, as sent by the owner.
 *
 * <p>When {@code isFree} is true the price is stored as 0; when false a
 * non-negative price is required.</p>
 */
public record SpacePricingRequest(

        @NotNull(message = "Activity is required.")
        ActivityType activityType,

        @NotNull(message = "Choose whether this activity is free.")
        Boolean isFree,

        @DecimalMin(value = "0.0", message = "Price cannot be negative.")
        BigDecimal price,

        @Size(max = 500, message = "Activity note must be at most 500 characters.")
        String ownerNote) {
}
