package com.resource.backend.ai.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * What the description endpoint accepts: the facts the owner has already
 * confirmed in the form. Nothing else is allowed in, so nothing else can reach
 * the provider - passwords, tokens and contact details have no field here.
 */
public record AiDescriptionRequest(
        @NotBlank(message = "Add a material name first.")
        @Size(max = 160, message = "Please keep the material name under 160 characters.")
        String title,

        MaterialCategory category,
        MaterialCondition condition,
        BigDecimal quantity,
        @Size(max = 20, message = "Please keep the unit short.")
        String quantityUnit,
        BigDecimal price,
        Boolean isFree,
        @Size(max = 200, message = "Please keep the location under 200 characters.")
        String locationText,
        @Size(max = 500, message = "Please keep the note under 500 characters.")
        String ownerNote) {
}
