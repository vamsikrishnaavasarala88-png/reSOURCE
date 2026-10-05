package com.resource.backend.dto;

import com.resource.backend.entity.RequestStatus;
import com.resource.backend.entity.SpaceRequest;

/**
 * Wording for a request's status, which depends on what the request is about.
 *
 * <p>A space request that is accepted confirms a booking, so the status really
 * does mean "Booking confirmed". A material request creates no booking at all,
 * so calling it the same thing would describe something that never happened.</p>
 */
final class RequestStatusLabels {

    private RequestStatusLabels() {
    }

    static String of(SpaceRequest request) {
        if (request.isMaterialRequest() && request.getStatus() == RequestStatus.ACCEPTED) {
            return "Request accepted";
        }

        return request.getStatus().getLabel();
    }
}
