package com.resource.backend.entity;

import java.util.Arrays;
import java.util.Optional;

/**
 * How the owner describes the state of their surplus material.
 *
 * <p>The owner picks this; the platform never infers it, and later phases must
 * not fill it in from a photo.</p>
 */
public enum MaterialCondition {

    NEW("New"),
    GOOD("Good"),
    USED("Used"),
    DAMAGED("Damaged");

    private final String label;

    MaterialCondition(String label) {
        this.label = label;
    }

    /** Human readable name for the UI. */
    public String getLabel() {
        return label;
    }

    /** Parses a condition name, or returns empty when it is not one of the set. */
    public static Optional<MaterialCondition> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }

        String cleaned = value.trim().toUpperCase().replace(' ', '_').replace('-', '_');

        return Arrays.stream(values())
                .filter(condition -> condition.name().equals(cleaned))
                .findFirst();
    }
}
