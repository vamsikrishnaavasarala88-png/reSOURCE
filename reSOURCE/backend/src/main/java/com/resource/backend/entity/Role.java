package com.resource.backend.entity;

/**
 * Application roles.
 *
 * <p>Phase 2 only needs {@code USER}: a single role that can later both list and
 * request resources. Owner/requester specific roles are deliberately not
 * introduced, so no migration of existing users will be needed.</p>
 */
public enum Role {
    USER;
}
