package com.resource.backend.util;

import java.math.BigDecimal;

/**
 * The geographic part of a search request, sanitised before it reaches a query.
 *
 * <p>Search coordinates and a radius arrive from the browser, so they are treated
 * exactly like every other untrusted input: a latitude outside the world, a
 * longitude outside the world, a radius that is zero, negative, infinite or
 * absurdly large, or a radius with no coordinates to measure from, are all
 * dropped rather than passed to a query. What survives is a filter the backend
 * can actually enforce - and the caller is told which criteria were applied in
 * the response, so a dropped radius is never silently implied.</p>
 *
 * <p>Distance itself is never taken from the caller: it is computed here, from
 * the stored coordinates, by {@link GeoUtils}.</p>
 */
public record GeoQuery(BigDecimal latitude, BigDecimal longitude, Double radiusKm) {

    /** Beyond this, "nearby" stops meaning anything; a bigger number is a mistake. */
    public static final double MAX_RADIUS_KM = 500;

    private static final BigDecimal MAX_LATITUDE = new BigDecimal("90");
    private static final BigDecimal MIN_LATITUDE = new BigDecimal("-90");
    private static final BigDecimal MAX_LONGITUDE = new BigDecimal("180");
    private static final BigDecimal MIN_LONGITUDE = new BigDecimal("-180");

    /** A query with no location at all. */
    public static GeoQuery none() {
        return new GeoQuery(null, null, null);
    }

    /**
     * Reads a location search, keeping only what the backend can honour.
     *
     * @param latitude  centre of the search, or {@code null}
     * @param longitude centre of the search, or {@code null}
     * @param radiusKm  requested radius, or {@code null}
     * @return the usable part of that request; both coordinates are always kept or
     *         both dropped, because half a pair measures nothing
     */
    public static GeoQuery of(BigDecimal latitude, BigDecimal longitude, Double radiusKm) {
        if (!validLatitude(latitude) || !validLongitude(longitude)) {
            return none();
        }

        return new GeoQuery(latitude, longitude, validRadius(radiusKm));
    }

    /** True when this query has a centre to measure from. */
    public boolean hasCoordinates() {
        return latitude != null && longitude != null;
    }

    /** True when a radius is actually applied; a radius alone filters nothing. */
    public boolean filtersByRadius() {
        return hasCoordinates() && radiusKm != null;
    }

    public static boolean validLatitude(BigDecimal latitude) {
        return latitude != null
                && latitude.compareTo(MIN_LATITUDE) >= 0
                && latitude.compareTo(MAX_LATITUDE) <= 0;
    }

    public static boolean validLongitude(BigDecimal longitude) {
        return longitude != null
                && longitude.compareTo(MIN_LONGITUDE) >= 0
                && longitude.compareTo(MAX_LONGITUDE) <= 0;
    }

    /** A radius that can be enforced: a positive, finite, sane number of kilometres. */
    public static Double validRadius(Double radiusKm) {
        if (radiusKm == null || radiusKm.isNaN() || radiusKm.isInfinite()) {
            return null;
        }

        return radiusKm > 0 && radiusKm <= MAX_RADIUS_KM ? radiusKm : null;
    }
}
