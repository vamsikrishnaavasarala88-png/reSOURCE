package com.resource.backend.service;

import java.util.Locale;

/**
 * Emails are stored and compared lower-cased so that
 * {@code User@Example.com} and {@code user@example.com} are one account.
 */
final class EmailNormaliser {

    private EmailNormaliser() {
    }

    static String normalise(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    /** Blank phone numbers are stored as {@code null}. */
    static String normalisePhone(String phone) {
        if (phone == null) {
            return null;
        }
        String trimmed = phone.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
