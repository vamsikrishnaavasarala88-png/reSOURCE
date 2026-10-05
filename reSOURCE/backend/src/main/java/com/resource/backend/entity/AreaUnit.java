package com.resource.backend.entity;

import java.math.BigDecimal;

/**
 * Unit in which an owner enters a space's area.
 *
 * <p>Search filters always work on {@code areaSqft}, the normalised value stored
 * alongside the entered area, so areas expressed in different units stay
 * comparable.</p>
 */
public enum AreaUnit {
    SQ_FT("Square feet", new BigDecimal("1")),
    SQ_M("Square metres", new BigDecimal("10.7639")),
    SQ_YD("Square yards", new BigDecimal("9")),
    ACRES("Acres", new BigDecimal("43560")),
    HECTARES("Hectares", new BigDecimal("107639"));

    private final String label;
    private final BigDecimal squareFeetFactor;

    AreaUnit(String label, BigDecimal squareFeetFactor) {
        this.label = label;
        this.squareFeetFactor = squareFeetFactor;
    }

    public String getLabel() {
        return label;
    }

    /** Converts an area in this unit to square feet. */
    public BigDecimal toSquareFeet(BigDecimal area) {
        return area.multiply(squareFeetFactor);
    }
}
