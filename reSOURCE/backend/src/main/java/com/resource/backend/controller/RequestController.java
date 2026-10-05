package com.resource.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.resource.backend.dto.RequestResponse;
import com.resource.backend.dto.RequestSubmission;
import com.resource.backend.dto.RequestSummaryResponse;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.service.RequestService;

import jakarta.validation.Valid;

/**
 * Space request workflow.
 *
 * <p>All endpoints require a bearer token. The requester is always the
 * authenticated user; the owner is always derived from the space, so neither can
 * be chosen by the caller.</p>
 */
@RestController
@RequestMapping("/api/requests")
public class RequestController {

    private final RequestService requestService;

    public RequestController(RequestService requestService) {
        this.requestService = requestService;
    }

    /** Sends a request for a space. The response is the pending request. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RequestResponse create(
            @AuthenticationPrincipal ResourceUserDetails principal,
            @Valid @RequestBody RequestSubmission submission) {

        return requestService.create(principal.getId(), submission);
    }

    /** Requests the signed-in user sent. */
    @GetMapping("/my")
    public List<RequestSummaryResponse> my(@AuthenticationPrincipal ResourceUserDetails principal) {
        return requestService.listSentBy(principal.getId());
    }

    /** Requests for the spaces the signed-in user owns. */
    @GetMapping("/incoming")
    public List<RequestSummaryResponse> incoming(@AuthenticationPrincipal ResourceUserDetails principal) {
        return requestService.listReceivedBy(principal.getId());
    }

    /** One request: the requester and the space owner only. */
    @GetMapping("/{id}")
    public RequestResponse get(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return requestService.get(id, principal.getId());
    }

    /** Owner accepts: the request becomes ACCEPTED and a booking is confirmed. */
    @PostMapping("/{id}/accept")
    public RequestResponse accept(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return requestService.accept(id, principal.getId());
    }

    /** Owner rejects: the request ends as REJECTED, no booking is created. */
    @PostMapping("/{id}/reject")
    public RequestResponse reject(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return requestService.reject(id, principal.getId());
    }

    /** Requester cancels their own pending request. */
    @PostMapping("/{id}/cancel")
    public RequestResponse cancel(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return requestService.cancel(id, principal.getId());
    }
}
