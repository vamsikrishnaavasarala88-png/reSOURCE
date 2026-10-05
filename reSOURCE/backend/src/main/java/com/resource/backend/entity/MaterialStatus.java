package com.resource.backend.entity;

/**
 * Life cycle of a material listing.
 *
 * <p>{@code ACTIVE} is discoverable, {@code INACTIVE} is paused by the owner and
 * {@code DELETED} is a soft delete: the row stays for the requests that point at
 * it, but it disappears from the marketplace.</p>
 *
 * <p>This phase deliberately has no {@code RESERVED} or {@code SOLD}: accepting a
 * request does not move stock, so there is no reserved quantity to represent.</p>
 */
public enum MaterialStatus {
    ACTIVE,
    INACTIVE,
    DELETED
}
