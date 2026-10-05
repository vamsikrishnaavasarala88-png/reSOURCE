package com.resource.backend.repository;

import java.math.BigDecimal;
import java.util.Collection;

import org.springframework.data.jpa.domain.Specification;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpaceFacility;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Subquery;

/**
 * Reusable, composable filters for space search.
 *
 * <p>All filters use structured columns - activity and price lookups go through
 * the {@code space_pricing} table instead of matching free text.</p>
 */
public final class SpaceSpecifications {

    private SpaceSpecifications() {
    }

    public static Specification<Space> hasStatus(SpaceStatus status) {
        return (root, query, cb) -> cb.equal(root.get("status"), status);
    }

    public static Specification<Space> ownedBy(Long ownerId) {
        return (root, query, cb) -> cb.equal(root.get("owner").get("id"), ownerId);
    }

    /** Case-insensitive match on title, description or address. */
    public static Specification<Space> matchesText(String text) {
        String pattern = "%" + text.trim().toLowerCase() + "%";
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.get("title")), pattern),
                cb.like(cb.lower(root.get("description")), pattern),
                cb.like(cb.lower(root.get("address")), pattern));
    }

    /**
     * Keeps spaces that offer {@code activity} for at most {@code maxPrice}.
     *
     * <p>A maximum price of 0 means "free only": paid activities are excluded
     * even when their price is zero, because the owner decided they are paid.</p>
     */
    public static Specification<Space> offersActivity(ActivityType activity, BigDecimal maxPrice) {
        return (root, query, cb) -> {
            Subquery<Long> subquery = query.subquery(Long.class);
            var pricing = subquery.from(SpacePricing.class);
            subquery.select(cb.literal(1L));

            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            predicates.add(cb.equal(pricing.get("space"), root));

            if (activity != null) {
                predicates.add(cb.equal(pricing.get("activityType"), activity));
            }

            if (maxPrice != null) {
                if (maxPrice.signum() == 0) {
                    predicates.add(cb.isTrue(pricing.get("free")));
                } else {
                    predicates.add(cb.or(
                            cb.isTrue(pricing.get("free")),
                            cb.lessThanOrEqualTo(pricing.get("price"), maxPrice)));
                }
            }

            subquery.where(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
            return cb.exists(subquery);
        };
    }

    public static Specification<Space> hasMinimumCapacity(Integer minCapacity) {
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("capacity"), minCapacity);
    }

    public static Specification<Space> areaBetween(BigDecimal minAreaSqft, BigDecimal maxAreaSqft) {
        return (root, query, cb) -> {
            if (minAreaSqft != null && maxAreaSqft != null) {
                return cb.between(root.get("areaSqft"), minAreaSqft, maxAreaSqft);
            }
            if (minAreaSqft != null) {
                return cb.greaterThanOrEqualTo(root.get("areaSqft"), minAreaSqft);
            }
            return cb.lessThanOrEqualTo(root.get("areaSqft"), maxAreaSqft);
        };
    }

    /** Requires every listed facility (AND semantics). */
    public static Specification<Space> hasAllFacilities(Collection<Facility> facilities) {
        return (root, query, cb) -> {
            var predicates = facilities.stream().map(facility -> {
                Subquery<Long> subquery = query.subquery(Long.class);
                Join<SpaceFacility, Space> linked = subquery.correlate(root).join("facilities");
                subquery.select(cb.literal(1L));
                subquery.where(cb.equal(linked.get("facility"), facility));
                return cb.exists(subquery);
            }).toArray(jakarta.persistence.criteria.Predicate[]::new);

            return cb.and(predicates);
        };
    }

    /**
     * Bounding box around a point, used as a cheap pre-filter before the exact
     * Haversine distance is applied to the results.
     */
    public static Specification<Space> withinBounds(
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
}
