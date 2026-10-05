package com.resource.backend.controller;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.resource.backend.dto.BookingResponse;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.service.BookingService;

/**
 * Confirmed bookings of the signed-in user, as a requester and as a host.
 *
 * <p>Read only: bookings are created by accepting a request
 * ({@code POST /api/requests/{id}/accept}).</p>
 */
@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    /** Bookings the signed-in user made for someone else's space. */
    @GetMapping("/my")
    public List<BookingResponse> my(@AuthenticationPrincipal ResourceUserDetails principal) {
        return bookingService.listForRequester(principal.getId());
    }

    /** Bookings for the spaces the signed-in user owns. */
    @GetMapping("/owner")
    public List<BookingResponse> owner(@AuthenticationPrincipal ResourceUserDetails principal) {
        return bookingService.listForOwner(principal.getId());
    }

    /** One booking: its requester and the space owner only. */
    @GetMapping("/{id}")
    public BookingResponse get(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return bookingService.get(id, principal.getId());
    }
}
