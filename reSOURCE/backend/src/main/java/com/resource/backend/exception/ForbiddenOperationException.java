package com.resource.backend.exception;

/**
 * Thrown when the authenticated user is not allowed to touch a record they do
 * not own. Mapped to HTTP 403.
 */
public class ForbiddenOperationException extends RuntimeException {

    public ForbiddenOperationException(String message) {
        super(message);
    }
}
