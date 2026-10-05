package com.resource.backend.entity;

/**
 * Lifecycle of a listing.
 *
 * <p>Deleting is a soft delete ({@link #DELETED}) so later phases can keep
 * historical references; deleted listings never appear in discovery.</p>
 */
public enum SpaceStatus {
    ACTIVE,
    INACTIVE,
    DELETED
}
