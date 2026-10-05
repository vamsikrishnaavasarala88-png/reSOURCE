package com.resource.backend.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.RequestStatus;
import com.resource.backend.entity.ResourceType;
import com.resource.backend.entity.SpaceRequest;

/**
 * One row in "My requests" and "Incoming requests", for either marketplace.
 *
 * <p>Carries no contact details: a list is never a place to leak a phone number,
 * and they stay private until a request is accepted. Names, however, are shown -
 * an owner has to see who is asking - so the row carries the counterpart's name
 * only, resolved for the caller.</p>
 *
 * <p>Space requests fill {@code spaceId}, {@code spaceTitle}, {@code purpose},
 * {@code requestDate}, the times and {@code expectedPeople}. Material requests
 * fill {@code material}, {@code quantityRequested} and {@code unit} instead;
 * their other fields are {@code null}, which the UI reads as "not applicable"
 * rather than as a missing value.</p>
 *
 * @param viewerRole  {@code REQUESTER} or {@code OWNER} - what the caller is to
 *                    this request, which decides how the card reads
 * @param counterpart the other party: the requester for an owner, the owner for
 *                    the requester; name only
 * @param material    the requested material, for material requests only
 * @param amount      the owner's price for the requested material, or the space
 *                    activity price; {@code null} when it cannot be determined
 */
public record RequestSummaryResponse(
        Long id,
        ResourceType resourceType,
        Long spaceId,
        String spaceTitle,
        String spaceAddress,
        MaterialRef material,
        BigDecimal quantityRequested,
        String unit,
        ActivityType purpose,
        String purposeLabel,
        LocalDate requestDate,
        LocalTime startTime,
        LocalTime endTime,
        Integer expectedPeople,
        String message,
        RequestStatus status,
        String statusLabel,
        BigDecimal amount,
        boolean isFree,
        Long bookingId,
        String viewerRole,
        RequestParty counterpart,
        Instant createdAt) {

    public static RequestSummaryResponse from(SpaceRequest request, Long viewerId) {
        boolean viewerIsRequester = request.getRequester().getId().equals(viewerId);
        RequestParty counterpart = viewerIsRequester
                ? RequestParty.from(request.getOwner())
                : RequestParty.from(request.getRequester());
        String viewerRole = viewerIsRequester
                ? RequestResponse.ROLE_REQUESTER
                : RequestResponse.ROLE_OWNER;

        return new RequestSummaryResponse(
                request.getId(),
                request.getResourceType(),
                request.getSpace() == null ? null : request.getSpace().getId(),
                request.getSpace() == null ? null : request.getSpace().getTitle(),
                request.getSpace() == null ? null : request.getSpace().getAddress(),
                MaterialRef.from(request.getMaterial()),
                request.getQuantityRequested(),
                request.getMaterial() == null ? null : request.getMaterial().getUnit(),
                request.getPurpose(),
                request.getPurpose() == null ? null : request.getPurpose().getLabel(),
                request.getRequestDate(),
                request.getStartTime(),
                request.getEndTime(),
                request.getExpectedPeople(),
                request.getMessage(),
                request.getStatus(),
                RequestStatusLabels.of(request),
                RequestPricing.amountOf(request),
                RequestPricing.isFree(request),
                request.getBooking() == null ? null : request.getBooking().getId(),
                viewerRole,
                counterpart,
                request.getCreatedAt());
    }
}
