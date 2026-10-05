package com.resource.backend.entity;

/**
 * What a request is about.
 *
 * <p>A space request books a date and time; a material request asks for a
 * quantity of surplus material. Both share one request table, and the type says
 * which fields of a row are meaningful.</p>
 */
public enum ResourceType {
    SPACE("Space"),
    MATERIAL("Material");

    private final String label;

    ResourceType(String label) {
        this.label = label;
    }

    /** Human readable name for the UI. */
    public String getLabel() {
        return label;
    }
}
