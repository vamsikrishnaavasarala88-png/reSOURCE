package com.resource.backend.entity;

/**
 * Facilities a space can offer. Extend this enum to add new ones; no schema
 * change is required because the value is stored as a string.
 */
public enum Facility {
    PARKING("Parking"),
    ELECTRICITY("Electricity"),
    WATER("Water"),
    WASHROOMS("Washrooms"),
    LIGHTING("Lighting"),
    STAGE("Stage"),
    SEATING("Seating"),
    ROAD_ACCESS("Road Access"),
    PUBLIC_TRANSPORT("Public Transport");

    private final String label;

    Facility(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
