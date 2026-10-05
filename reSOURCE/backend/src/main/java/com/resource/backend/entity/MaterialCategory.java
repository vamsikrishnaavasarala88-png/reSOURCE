package com.resource.backend.entity;

import java.util.Arrays;
import java.util.Optional;

/**
 * Controlled set of material categories.
 *
 * <p>Stored as the enum name so the set can grow without touching the database
 * schema beyond the check constraint, and labelled here so the UI never has to
 * translate values on its own.</p>
 */
public enum MaterialCategory {

    BRICKS("Bricks"),
    CEMENT("Cement"),
    TILES("Tiles"),
    WOOD("Wood"),
    METAL("Metal"),
    PIPES("Pipes"),
    SAND("Sand"),
    STONE("Stone"),
    OTHER("Other");

    private final String label;

    MaterialCategory(String label) {
        this.label = label;
    }

    /** Human readable name for the UI. */
    public String getLabel() {
        return label;
    }

    /** Parses a category name, or returns empty when it is not one of the set. */
    public static Optional<MaterialCategory> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }

        String cleaned = value.trim().toUpperCase().replace(' ', '_').replace('-', '_');

        return Arrays.stream(values())
                .filter(category -> category.name().equals(cleaned))
                .findFirst();
    }
}
