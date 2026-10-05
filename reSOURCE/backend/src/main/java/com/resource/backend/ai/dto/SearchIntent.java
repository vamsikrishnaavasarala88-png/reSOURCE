package com.resource.backend.ai.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.ResourceType;

/**
 * What a sentence asked for, as a typed and validated filter set.
 *
 * <p>This is the only shape the model's answer is allowed to become. It holds
 * no entities, no prices from the model and no identifiers: the backend turns it
 * into the same specifications the ordinary filters use, so nothing AI-derived
 * ever reaches the database as a value.</p>
 *
 * <p>Values that fail validation (an unknown category, a negative price, a
 * latitude out of range) are set to {@code null} rather than passed on. A list
 * that arrived empty stays empty, which is what "the user did not ask for this"
 * looks like for a multi-valued criterion.</p>
 */
public record SearchIntent(
        ResourceType resourceType,
        ActivityType activity,
        MaterialCategory category,
        MaterialCondition condition,
        BigDecimal maxPrice,
        BigDecimal minQuantity,
        BigDecimal maxQuantity,
        String quantityUnit,
        Integer capacity,
        List<Facility> facilities,
        BigDecimal minAreaSqft,
        BigDecimal maxAreaSqft,
        Double radiusKm,
        LocalDate date,
        BigDecimal latitude,
        BigDecimal longitude,
        Boolean freeOnly,
        String locationText,
        String query) {

    public SearchIntent {
        facilities = facilities == null ? List.of() : List.copyOf(facilities);
    }

    /**
     * The same intent with one field cleared.
     *
     * <p>Used when a filter cannot be honored - a radius with no coordinates to
     * measure from, a facility relaxing away - so the caller is never told a
     * criterion was applied when it was not.</p>
     */
    public SearchIntent withoutRadius() {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                null, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the quantity bounds, used when no unit is known. */
    public SearchIntent withoutQuantityFilter() {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                null, null, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the activity, used when nothing offers it. */
    public SearchIntent withoutActivity() {
        return new SearchIntent(resourceType, null, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the capacity, used when nothing is big enough. */
    public SearchIntent withoutCapacity() {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, null, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the facilities, used when nothing offers them all. */
    public SearchIntent withoutFacilities() {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, List.of(), minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the area bounds, used when nothing is that size. */
    public SearchIntent withoutArea() {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, null, null,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the budget, used when nothing is cheap enough. */
    public SearchIntent withoutPrice() {
        return new SearchIntent(resourceType, activity, category, condition, null,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, null, locationText, query);
    }

    /** The same intent without the condition, used when nothing is in that state. */
    public SearchIntent withoutCondition() {
        return new SearchIntent(resourceType, activity, category, null, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent without the category, used when nothing is listed under it. */
    public SearchIntent withoutCategory() {
        return new SearchIntent(resourceType, activity, null, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /** The same intent with only the text and the marketplace left. */
    public SearchIntent textOnly() {
        return new SearchIntent(resourceType, null, null, null, null,
                null, null, null, null, List.of(), null, null, radiusKm, null,
                latitude, longitude, null, locationText, query);
    }

    /**
     * The same intent with no text to match against.
     *
     * <p>The criteria stages filter by what the model understood; the visitor's
     * own sentence is only ever used as a text filter in the stage built for it,
     * so an unmatched sentence cannot quietly narrow every other stage.</p>
     */
    public SearchIntent withoutQuery() {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, null);
    }

    /** The same intent with different words to match text against. */
    public SearchIntent withQuery(String newQuery) {
        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, newQuery);
    }
}
