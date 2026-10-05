package com.resource.backend.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.SpacePricing;

/** One activity/price pair of a space. */
public record SpacePricingResponse(
        Long id,
        ActivityType activityType,
        String activityLabel,
        BigDecimal price,
        boolean isFree,
        String ownerNote) {

    public static SpacePricingResponse from(SpacePricing pricing) {
        return new SpacePricingResponse(
                pricing.getId(),
                pricing.getActivityType(),
                pricing.getActivityType().getLabel(),
                pricing.getPrice(),
                pricing.isFree(),
                pricing.getOwnerNote());
    }
}
