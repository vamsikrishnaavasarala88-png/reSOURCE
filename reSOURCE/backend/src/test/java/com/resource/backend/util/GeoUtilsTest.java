package com.resource.backend.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.assertj.core.data.Offset;
import org.junit.jupiter.api.Test;

/**
 * The distance maths on its own, with no database and no web layer.
 *
 * <p>Haversine is the authoritative way this application measures distance - the
 * radius filter, the "nearest first" order and every distance shown in the UI
 * come from it - so its numbers are pinned here against places whose separation
 * is known, and its edges are checked: the same point, the antimeridian, the
 * poles, and every combination of missing coordinates.</p>
 */
class GeoUtilsTest {

    /** Bhimavaram, Andhra Pradesh - the town the demo data is written around. */
    private static final BigDecimal BHIMAVARAM_LAT = new BigDecimal("16.544900");
    private static final BigDecimal BHIMAVARAM_LON = new BigDecimal("81.521200");

    @Test
    void measuresAKnownDistance() {
        // Bhimavaram to Vijayawada is about 70 km as the crow flies.
        Double distance = GeoUtils.haversineKm(
                BHIMAVARAM_LAT, BHIMAVARAM_LON,
                new BigDecimal("16.506174"), new BigDecimal("80.648015"));

        assertThat(distance).isNotNull().isBetween(88.0, 96.0);
    }

    @Test
    void measuresAShortDistanceAccurately() {
        // One hundredth of a degree of latitude is about 1.11 km anywhere.
        Double distance = GeoUtils.haversineKm(
                BHIMAVARAM_LAT, BHIMAVARAM_LON,
                new BigDecimal("16.554900"), BHIMAVARAM_LON);

        assertThat(distance).isNotNull().isBetween(1.10, 1.12);
    }

    @Test
    void theSamePointIsZeroKilometresAway() {
        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON,
                BHIMAVARAM_LAT, BHIMAVARAM_LON)).isZero();
    }

    @Test
    void distanceIsTheSameWhicheverWayItIsMeasured() {
        Double there = GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON,
                new BigDecimal("17.000000"), new BigDecimal("82.000000"));
        Double back = GeoUtils.haversineKm(new BigDecimal("17.000000"), new BigDecimal("82.000000"),
                BHIMAVARAM_LAT, BHIMAVARAM_LON);

        assertThat(there).isNotNull().isEqualTo(back);
    }

    @Test
    void measuresAcrossTheAntimeridianWithoutWrapping() {
        // Two tenths of a degree apart, either side of the 180th meridian.
        Double distance = GeoUtils.haversineKm(
                new BigDecimal("0.000000"), new BigDecimal("179.900000"),
                new BigDecimal("0.000000"), new BigDecimal("-179.900000"));

        assertThat(distance).isNotNull().isBetween(22.0, 23.0);
    }

    @Test
    void measuresFromTheEquatorToAPole() {
        // A quarter of the circumference: about 10,000 km.
        Double distance = GeoUtils.haversineKm(
                new BigDecimal("0.000000"), new BigDecimal("0.000000"),
                new BigDecimal("90.000000"), new BigDecimal("0.000000"));

        assertThat(distance).isNotNull().isBetween(10_000.0, 10_020.0);
    }

    @Test
    void returnsNothingWhenACoordinateIsMissing() {
        assertThat(GeoUtils.haversineKm(null, BHIMAVARAM_LON, BHIMAVARAM_LAT, BHIMAVARAM_LON)).isNull();
        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, null, BHIMAVARAM_LAT, BHIMAVARAM_LON)).isNull();
        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON, null, BHIMAVARAM_LON)).isNull();
        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON, BHIMAVARAM_LAT, null)).isNull();
    }

    @Test
    void aPointBuiltOnAMeridianLandsExactlyOnTheRadius() {
        // Due north of the origin the great-circle distance is simply R times the
        // change in latitude, so that inverse is exact - which is how the radius
        // boundary is pinned here and in the search tests, with no map involved.
        double radiusKm = 5.0;

        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON, northOf(radiusKm), BHIMAVARAM_LON))
                .isCloseTo(radiusKm, Offset.offset(0.001));

        // A metre short is inside; a metre beyond is outside.
        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON, northOf(radiusKm - 0.001), BHIMAVARAM_LON))
                .isLessThan(radiusKm);
        assertThat(GeoUtils.haversineKm(BHIMAVARAM_LAT, BHIMAVARAM_LON, northOf(radiusKm + 0.001), BHIMAVARAM_LON))
                .isGreaterThan(radiusKm);
    }

    /** A point {@code km} due north of the origin: the inverse Haversine on a meridian. */
    private static BigDecimal northOf(double km) {
        return BHIMAVARAM_LAT.add(
                BigDecimal.valueOf(Math.toDegrees(km / 6371.0088)).setScale(6, RoundingMode.HALF_UP));
    }

    @Test
    void theBoundingBoxAlwaysContainsTheCircle() {
        // A point due north at exactly the radius must fall inside the box, or the
        // database would filter it away before the Haversine could judge it.
        double radiusKm = 5.0;
        double[] box = GeoUtils.boundingBox(BHIMAVARAM_LAT.doubleValue(), BHIMAVARAM_LON.doubleValue(), radiusKm);

        assertThat(northOf(radiusKm).doubleValue()).isBetween(box[0], box[1]);

        // East and west at the radius, too.
        assertThat(BHIMAVARAM_LON.doubleValue() + GeoUtils.longitudeDelta(radiusKm, 16.5449)).isLessThanOrEqualTo(box[3]);
        assertThat(BHIMAVARAM_LON.doubleValue() - GeoUtils.longitudeDelta(radiusKm, 16.5449)).isGreaterThanOrEqualTo(box[2]);
    }

    @Test
    void theBoundingBoxWidensWhereTheWorldIsAwkward() {
        // Near a pole the box spans every longitude rather than a sliver of them:
        // no fixed range can cover a 25 km circle where longitudes converge.
        double[] polar = GeoUtils.boundingBox(89.9, 10.0, 25);
        assertThat(polar[2]).isEqualTo(-180);
        assertThat(polar[3]).isEqualTo(180);
        // The latitude bound is still the real one.
        assertThat(polar[0]).isGreaterThanOrEqualTo(-90);
        assertThat(polar[1]).isEqualTo(90);

        // A circle crossing the antimeridian has no single longitude range, so the
        // longitude bound is dropped instead of matching nothing.
        double[] acrossTheDateLine = GeoUtils.boundingBox(-16.5, 179.99, 25);
        assertThat(acrossTheDateLine[2]).isEqualTo(-180);
        assertThat(acrossTheDateLine[3]).isEqualTo(180);

        // Latitude never leaves the world.
        double[] northPole = GeoUtils.boundingBox(89.0, 0, 500);
        assertThat(northPole[1]).isEqualTo(90);
    }

    @Test
    void aRadiusConvertsToASensibleBoundingBox() {
        assertThat(GeoUtils.latitudeDelta(1)).isBetween(0.008, 0.010);

        // Lines of longitude converge towards the poles, so the same radius spans
        // more degrees of longitude the further north it is taken.
        assertThat(GeoUtils.longitudeDelta(10, 0)).isBetween(0.089, 0.091);
        assertThat(GeoUtils.longitudeDelta(10, 60)).isBetween(0.17, 0.19);

        // At the pole the cosine guard keeps the box finite instead of dividing by zero.
        assertThat(GeoUtils.longitudeDelta(10, 90)).isFinite();
    }
}
