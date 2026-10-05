package com.resource.backend.util;

import java.math.BigDecimal;

/**
 * Distance helpers for the marketplace MVP.
 */
public final class GeoUtils {

    /** Mean Earth radius in kilometres. */
    private static final double EARTH_RADIUS_KM = 6371.0088;

    private GeoUtils() {
    }

    /**
     * Great-circle distance between two points using the Haversine formula.
     *
     * @return distance in kilometres, or {@code null} when a coordinate is missing
     */
    public static Double haversineKm(BigDecimal latitudeA, BigDecimal longitudeA,
                                     BigDecimal latitudeB, BigDecimal longitudeB) {
        if (latitudeA == null || longitudeA == null || latitudeB == null || longitudeB == null) {
            return null;
        }

        double latA = Math.toRadians(latitudeA.doubleValue());
        double latB = Math.toRadians(latitudeB.doubleValue());
        double deltaLat = latB - latA;
        double deltaLon = Math.toRadians(longitudeB.doubleValue() - longitudeA.doubleValue());

        double sinLat = Math.sin(deltaLat / 2);
        double sinLon = Math.sin(deltaLon / 2);

        double a = sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLon * sinLon;
        double c = 2 * Math.asin(Math.min(1, Math.sqrt(a)));

        return EARTH_RADIUS_KM * c;
    }

    /** Degrees of latitude per kilometre on the same sphere the Haversine uses. */
    private static final double KM_PER_DEGREE = EARTH_RADIUS_KM * Math.PI / 180;

    /**
     * How much wider than the circle the bounding box is drawn.
     *
     * <p>The box is a prefilter, never the filter: the radius is decided by the
     * Haversine afterwards. Any error in the box that makes it *smaller* than the
     * circle would silently drop listings the visitor asked for - a point exactly
     * on the radius is the obvious one - so a margin is added to keep the box a
     * true superset. A circle is at most ~41% larger in area than its box, so a
     * small margin costs nothing and buys correctness at the edge.</p>
     */
    private static final double BOUNDING_BOX_MARGIN = 1.01;

    /** Latitude degrees that safely cover the given distance. */
    public static double latitudeDelta(double radiusKm) {
        return radiusKm / KM_PER_DEGREE * BOUNDING_BOX_MARGIN;
    }

    /**
     * Longitude degrees that safely cover the given distance at the given latitude.
     *
     * <p>Lines of longitude converge towards the poles, so the box is widened using
     * the cosine of the latitude *nearest the pole inside the box* rather than the
     * centre: at the centre the box would be too narrow at its own edges and could
     * cut off listings the radius contains. Very close to a pole this number stops
     * being useful at all - {@link #boundingBox} drops the longitude bound there
     * instead of drawing a box that misses half the circle.</p>
     */
    public static double longitudeDelta(double radiusKm, double latitude) {
        return latitudeDelta(radiusKm) / Math.max(cosineNearestThePole(radiusKm, latitude), MINIMUM_COSINE);
    }

    /** Longitudes converge completely at a pole; below this, no range is usable. */
    private static final double MINIMUM_COSINE = 0.01;

    private static double cosineNearestThePole(double radiusKm, double latitude) {
        return Math.cos(Math.toRadians(Math.min(90, Math.abs(latitude) + latitudeDelta(radiusKm))));
    }

    /**
     * The prefilter box for a radius search: {@code [minLat, maxLat, minLon, maxLon]}.
     *
     * <p>It always contains the circle, which is why the two awkward places are
     * handled here rather than in each query:</p>
     * <ul>
     *   <li>Near the poles the longitude half-width grows without limit, and the
     *       box is simply widened to the whole world rather than being drawn too
     *       narrow.</li>
     *   <li>A circle crossing the antimeridian (±180°) has no single longitude
     *       range, so the longitude filter is dropped instead of becoming an empty
     *       range that matches nothing.</li>
     * </ul>
     *
     * <p>Dropping a bound never widens the result set: the Haversine decides what
     * is inside the radius. A box that is too tight, on the other hand, would hide
     * listings that are genuinely nearby.</p>
     */
    public static double[] boundingBox(double latitude, double longitude, double radiusKm) {
        double latitudeDelta = latitudeDelta(radiusKm);
        double longitudeDelta = longitudeDelta(radiusKm, latitude);

        double minLatitude = Math.max(-90, latitude - latitudeDelta);
        double maxLatitude = Math.min(90, latitude + latitudeDelta);

        // Where lines of longitude converge almost to a point, no fixed range
        // covers the circle, so the longitude filter is dropped rather than drawn
        // too narrow. The Haversine still decides what is inside the radius.
        boolean spansTheWholeWorld = cosineNearestThePole(radiusKm, latitude) < MINIMUM_COSINE
                || longitudeDelta >= 180
                || longitude - longitudeDelta < -180
                || longitude + longitudeDelta > 180;

        double minLongitude = spansTheWholeWorld ? -180 : longitude - longitudeDelta;
        double maxLongitude = spansTheWholeWorld ? 180 : longitude + longitudeDelta;

        return new double[] {minLatitude, maxLatitude, minLongitude, maxLongitude};
    }
}
