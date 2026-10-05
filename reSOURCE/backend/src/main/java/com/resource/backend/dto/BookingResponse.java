package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import com.resource.backend.entity.Booking;
import com.resource.backend.entity.BookingStatus;
import com.resource.backend.entity.ResourceType;

/**
 * A confirmed booking, as seen by one of its two parties.
 *
 * @param contact the other party's details, and only when the booking is
 *                confirmed and the viewer is the requester or the owner;
 *                {@code null} otherwise
 */
public record BookingResponse(
        Long id,
        Long requestId,
        ResourceType resourceType,
        Long resourceId,
        SpaceRef space,
        RequestParty owner,
        RequestParty requester,
        LocalDate bookingDate,
        LocalTime startTime,
        LocalTime endTime,
        BigDecimal amount,
        BigDecimal platformFee,
        BigDecimal totalAmount,
        BookingStatus status,
        String statusLabel,
        ContactDetails contact,
        Instant createdAt) {

    /**
     * Builds the response for one viewer. Contact details are attached only for a
     * confirmed booking and only for a party of it, so an unrelated caller can
     * never receive them by guessing an id.
     */
    public static BookingResponse from(Booking booking, Long viewerId) {
        return new BookingResponse(
                booking.getId(),
                booking.getRequest() == null ? null : booking.getRequest().getId(),
                booking.getResourceType(),
                booking.getResourceId(),
                SpaceRef.from(booking.getSpace()),
                RequestParty.from(booking.getOwner()),
                RequestParty.from(booking.getRequester()),
                booking.getBookingDate(),
                booking.getStartTime(),
                booking.getEndTime(),
                booking.getAmount(),
                booking.getPlatformFee(),
                booking.getTotalAmount(),
                booking.getStatus(),
                booking.getStatus().getLabel(),
                contactFor(booking, viewerId),
                booking.getCreatedAt());
    }

    private static ContactDetails contactFor(Booking booking, Long viewerId) {
        if (!booking.isConfirmed() || viewerId == null) {
            return null;
        }

        if (viewerId.equals(booking.getRequester().getId())) {
            return ContactDetails.of(booking.getOwner());
        }

        if (viewerId.equals(booking.getOwner().getId())) {
            return ContactDetails.of(booking.getRequester());
        }

        return null;
    }
}
