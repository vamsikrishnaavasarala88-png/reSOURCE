package com.resource.backend.entity;

/**
 * Life cycle of a request.
 *
 * <p>Allowed transitions: {@code PENDING -> ACCEPTED} (which also creates the
 * booking), {@code PENDING -> REJECTED} and {@code PENDING -> CANCELLED}.
 * Anything else is refused by the service, so a rejected or cancelled request
 * can never be accepted afterwards.</p>
 */
public enum RequestStatus {
    PENDING("Awaiting owner response"),
    ACCEPTED("Booking confirmed"),
    REJECTED("Request rejected"),
    CANCELLED("Request cancelled"),
    COMPLETED("Completed");

    private final String label;

    RequestStatus(String label) {
        this.label = label;
    }

    /** Wording shown next to the status badge. */
    public String getLabel() {
        return label;
    }

    public boolean isOpen() {
        return this == PENDING;
    }
}
