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
 * Full request payload for the details page.
 *
 * @param space      the requested space; {@code null} for a material request
 * @param material   the requested material; {@code null} for a space request
 * @param viewerRole {@code REQUESTER} or {@code OWNER} - what the caller is to
 *                   this request, so the UI knows which actions to offer; the
 *                   backend re-checks it on every action
 * @param booking    the confirmed booking, once a space request was accepted -
 *                   material requests never create one
 * @param contact    the other party's contact details: only after the request was
 *                   accepted, and only for the two parties
 */
public record RequestResponse(
        Long id,
        ResourceType resourceType,
        SpaceRef space,
        MaterialRef material,
        java.math.BigDecimal quantityRequested,
        String unit,
        RequestParty requester,
        RequestParty owner,
        ActivityType purpose,
        String purposeLabel,
        LocalDate requestDate,
        LocalTime startTime,
        LocalTime endTime,
        Integer expectedPeople,
        String message,
        RequestStatus status,
        String statusLabel,
        BigDecimal price,
        BigDecimal amount,
        boolean isFree,
        String viewerRole,
        BookingResponse booking,
        ContactDetails contact,
        Instant createdAt,
        Instant updatedAt) {

    public static final String ROLE_REQUESTER = "REQUESTER";
    public static final String ROLE_OWNER = "OWNER";

    public static RequestResponse from(SpaceRequest request, Long viewerId) {
        BookingResponse booking = request.getBooking() == null
                ? null
                : BookingResponse.from(request.getBooking(), viewerId);

        return new RequestResponse(
                request.getId(),
                request.getResourceType(),
                SpaceRef.from(request.getSpace()),
                MaterialRef.from(request.getMaterial()),
                request.getQuantityRequested(),
                request.getMaterial() == null ? null : request.getMaterial().getUnit(),
                RequestParty.from(request.getRequester()),
                RequestParty.from(request.getOwner()),
                request.getPurpose(),
                request.getPurpose() == null ? null : request.getPurpose().getLabel(),
                request.getRequestDate(),
                request.getStartTime(),
                request.getEndTime(),
                request.getExpectedPeople(),
                request.getMessage(),
                request.getStatus(),
                RequestStatusLabels.of(request),
                RequestPricing.priceOf(request),
                RequestPricing.amountOf(request),
                RequestPricing.isFree(request),
                request.wasSentBy(viewerId) ? ROLE_REQUESTER : ROLE_OWNER,
                booking,
                contactFor(request, viewerId),
                request.getCreatedAt(),
                request.getUpdatedAt());
    }

    /**
     * The requester sees the owner's details and the owner sees the requester's -
     * but only once the request was accepted.
     *
     * <p>For a space request that means the booking must exist and be confirmed;
     * a material request is done at acceptance, because it creates no booking.</p>
     */
    private static ContactDetails contactFor(SpaceRequest request, Long viewerId) {
        if (viewerId == null || !request.isAccepted() || !contactIsUnlocked(request)) {
            return null;
        }

        if (request.wasSentBy(viewerId)) {
            return ContactDetails.of(request.getOwner());
        }

        if (request.isForOwner(viewerId)) {
            return ContactDetails.of(request.getRequester());
        }

        return null;
    }

    private static boolean contactIsUnlocked(SpaceRequest request) {
        if (request.isMaterialRequest()) {
            return true;
        }

        return request.getBooking() != null && request.getBooking().isConfirmed();
    }
}
