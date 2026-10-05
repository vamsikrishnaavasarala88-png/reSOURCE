package com.resource.backend.repository;

import java.math.BigDecimal;

import org.springframework.data.jpa.domain.Specification;

import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.MaterialStatus;

/**
 * Reusable, composable filters for material search.
 *
 * <p>Every filter uses structured columns. The quantity filter is the one that
 * needs care: it only ever compares within one unit, because 200 kg and 200
 * pieces are not the same amount of anything.</p>
 */
public final class MaterialSpecifications {

    private MaterialSpecifications() {
    }

    public static Specification<Material> hasStatus(MaterialStatus status) {
        return (root, query, cb) -> cb.equal(root.get("status"), status);
    }

    public static Specification<Material> ownedBy(Long ownerId) {
        return (root, query, cb) -> cb.equal(root.get("owner").get("id"), ownerId);
    }

    /** Case-insensitive match on title, description or address. */
    public static Specification<Material> matchesText(String text) {
        String pattern = "%" + text.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.get("title")), pattern),
                cb.like(cb.lower(root.get("description")), pattern),
                cb.like(cb.lower(root.get("address")), pattern));
    }

    public static Specification<Material> hasCategory(MaterialCategory category) {
        return (root, query, cb) -> cb.equal(root.get("category"), category);
    }

    public static Specification<Material> hasCondition(MaterialCondition condition) {
        return (root, query, cb) -> cb.equal(root.get("condition"), condition);
    }

    /**
     * At least {@code minQuantity} of the material, counted in {@code unit}.
     *
     * <p>The unit is required by the caller: comparing a quantity across units
     * would be a lie, so nothing is filtered when the unit is missing.</p>
     */
    public static Specification<Material> hasMinimumQuantity(BigDecimal minQuantity, String unit) {
        String normalisedUnit = normaliseUnit(unit);

        return (root, query, cb) -> cb.and(
                cb.greaterThanOrEqualTo(root.get("quantity"), minQuantity),
                cb.equal(cb.lower(cb.trim(root.get("unit"))), normalisedUnit));
    }

    /**
     * Free listings, or listings the owner priced at most {@code maxPrice}.
     *
     * <p>A maximum price of 0 means "free only", matching the space marketplace:
     * the owner decided a listing is paid, so a paid listing is never treated as
     * free just because its amount happens to be zero.</p>
     */
    public static Specification<Material> costsAtMost(BigDecimal maxPrice) {
        if (maxPrice.signum() == 0) {
            return (root, query, cb) -> cb.isTrue(root.get("free"));
        }

        return (root, query, cb) -> cb.or(
                cb.isTrue(root.get("free")),
                cb.lessThanOrEqualTo(root.get("price"), maxPrice));
    }

    public static Specification<Material> isFreeOnly() {
        return (root, query, cb) -> cb.isTrue(root.get("free"));
    }

    /**
     * Bounding box around a point, used as a cheap pre-filter before the exact
     * Haversine distance is applied to the results.
     */
    public static Specification<Material> withinBounds(
            BigDecimal minLatitude,
            BigDecimal maxLatitude,
            BigDecimal minLongitude,
            BigDecimal maxLongitude) {

        return (root, query, cb) -> cb.and(
                cb.isNotNull(root.get("latitude")),
                cb.isNotNull(root.get("longitude")),
                cb.between(root.get("latitude"), minLatitude, maxLatitude),
                cb.between(root.get("longitude"), minLongitude, maxLongitude));
    }

    /** Units compare case-insensitively and without surrounding spaces. */
    public static String normaliseUnit(String unit) {
        return unit == null ? "" : unit.trim().toLowerCase();
    }
}
