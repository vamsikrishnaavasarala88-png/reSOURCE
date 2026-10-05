package com.resource.backend.exception;

/**
 * Raised when an operation clashes with the current state of the data: a slot
 * that is already booked, a space that is not active, or a status change that is
 * not allowed (for example accepting a request that was already rejected).
 *
 * <p>Answered with HTTP 409.</p>
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
