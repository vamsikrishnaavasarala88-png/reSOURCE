package com.resource.backend.entity;

/**
 * Life cycle of a booking. A booking is created as {@code CONFIRMED}; only
 * confirmed bookings take part in the overlap check.
 */
public enum BookingStatus {
    CONFIRMED("Booking confirmed"),
    CANCELLED("Booking cancelled"),
    COMPLETED("Completed");

    private final String label;

    BookingStatus(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
