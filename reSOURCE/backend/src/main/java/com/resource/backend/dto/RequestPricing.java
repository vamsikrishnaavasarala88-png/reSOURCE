package com.resource.backend.dto;

import java.math.BigDecimal;

import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceRequest;

/**
 * What a request costs, decided by the owner of the requested resource.
 *
 * <p>Nothing here is invented: a space request costs the owner's price for that
 * activity ({@link SpacePricing}), and a material request costs the owner's price
 * for that material. A free listing is the owner's decision and is reported as
 * {@code 0} - never as "no booking" and never as a platform decision.</p>
 */
final class RequestPricing {

    private RequestPricing() {
    }

    /** The owner's pricing row for a space request's activity, or {@code null}. */
    static SpacePricing find(SpaceRequest request) {
        if (request.getSpace() == null || request.getPurpose() == null) {
            return null;
        }

        return request.getSpace().getPricing().stream()
                .filter(entry -> entry.getActivityType() == request.getPurpose())
                .findFirst()
                .orElse(null);
    }

    /** The owner's price: the activity price for a space, the price for material. */
    static BigDecimal priceOf(SpaceRequest request) {
        if (request.getMaterial() != null) {
            return request.getMaterial().getPrice();
        }

        SpacePricing pricing = find(request);

        return pricing == null ? null : pricing.getPrice();
    }

    /** What the requester owes; 0 when the owner offers it for free. */
    static BigDecimal amountOf(SpaceRequest request) {
        if (request.getMaterial() != null) {
            return request.getMaterial().isFree() ? BigDecimal.ZERO : request.getMaterial().getPrice();
        }

        SpacePricing pricing = find(request);

        return pricing == null ? null : (pricing.isFree() ? BigDecimal.ZERO : pricing.getPrice());
    }

    static boolean isFree(SpaceRequest request) {
        if (request.getMaterial() != null) {
            return request.getMaterial().isFree();
        }

        SpacePricing pricing = find(request);

        return pricing != null && pricing.isFree();
    }
}
