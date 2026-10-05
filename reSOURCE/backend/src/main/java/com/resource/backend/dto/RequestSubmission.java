package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

import com.resource.backend.entity.ResourceType;
import com.resource.backend.validation.ValidRequestSubmission;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of {@code POST /api/requests}.
 *
 * <p>One endpoint serves both marketplaces, and {@code resourceType} decides
 * which of the fields matter:</p>
 *
 * <ul>
 *   <li>{@code SPACE}: {@code purpose} (an {@code ActivityType} name, sent as a
 *       string so an unusable value produces a readable field error),
 *       {@code requestDate}, {@code startTime}, {@code endTime} and
 *       {@code expectedPeople} are required.</li>
 *   <li>{@code MATERIAL}: {@code quantityRequested} is required and the space
 *       fields are not used.</li>
 * </ul>
 *
 * <p>Because the required set depends on the type, those rules are expressed by
 * {@link ValidRequestSubmission} rather than by {@code @NotNull} on every field,
 * and the service checks them again before writing anything. The requester is
 * always taken from the access token.</p>
 */
@ValidRequestSubmission
public record RequestSubmission(

        @NotNull(message = "Choose what you are requesting.")
        ResourceType resourceType,

        @NotNull(message = "Choose what you want to request.")
        Long resourceId,

        String purpose,

        @FutureOrPresent(message = "Choose today or a later date.")
        LocalDate requestDate,

        LocalTime startTime,

        LocalTime endTime,

        @Min(value = 1, message = "Expected people must be at least 1.")
        Integer expectedPeople,

        // Presence and sign are checked in the service, where the resource type is
        // known: the message then reads the same for a missing, zero or negative
        // quantity instead of three different validation texts.
        @Digits(integer = 10, fraction = 2, message = "Quantity must have at most 2 decimal places.")
        BigDecimal quantityRequested,

        @Size(max = 1000, message = "Keep the message under 1000 characters.")
        String message) {
}
