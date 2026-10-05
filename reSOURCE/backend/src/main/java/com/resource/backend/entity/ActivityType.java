package com.resource.backend.entity;

/**
 * Activities a space can be listed for.
 *
 * <p>Stored as a string in the database so new values can be added without a
 * schema change. The friendly label is only for presentation; the API always
 * returns the enum constant too.</p>
 */
public enum ActivityType {
    MARKET("Market"),
    UNION_MEETING("Union Meeting"),
    STUDENT_FEST("Student Fest"),
    EXHIBITION("Exhibition"),
    MEDICAL_CAMP("Medical Camp"),
    BLOOD_DONATION("Blood Donation Camp"),
    WORKSHOP("Workshop"),
    MEETING("Meeting"),
    SPORTS("Sports"),
    CULTURAL_EVENT("Cultural Event"),
    OTHER("Other");

    private final String label;

    ActivityType(String label) {
        this.label = label;
    }

    /** Human readable name, e.g. {@code BLOOD_DONATION -> "Blood Donation Camp"}. */
    public String getLabel() {
        return label;
    }
}
