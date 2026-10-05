package com.resource.backend.exception;

/**
 * Thrown when a registration or profile update would duplicate an existing
 * email address. Mapped to HTTP 409.
 */
public class DuplicateEmailException extends RuntimeException {

    public DuplicateEmailException(String email) {
        super("An account with the email " + email + " already exists.");
    }
}
