package com.resource.backend.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.resource.backend.dto.BookingResponse;
import com.resource.backend.entity.Booking;
import com.resource.backend.exception.ForbiddenOperationException;
import com.resource.backend.exception.ResourceNotFoundException;
import com.resource.backend.repository.BookingRepository;

/**
 * Read access to confirmed bookings.
 *
 * <p>Bookings are created by {@link RequestService#accept} - there is no
 * endpoint that writes one, so a booking cannot exist without an accepted
 * request. Contact details are attached per viewer in
 * {@link BookingResponse#from(Booking, Long)}.</p>
 */
@Service
public class BookingService {

    private final BookingRepository bookingRepository;

    public BookingService(BookingRepository bookingRepository) {
        this.bookingRepository = bookingRepository;
    }

    /** Bookings the user made as a requester, newest first. */
    @Transactional(readOnly = true)
    public List<BookingResponse> listForRequester(Long requesterId) {
        return bookingRepository.findAllForRequester(requesterId).stream()
                .map(booking -> BookingResponse.from(booking, requesterId))
                .toList();
    }

    /** Bookings of the spaces the user owns, newest first. */
    @Transactional(readOnly = true)
    public List<BookingResponse> listForOwner(Long ownerId) {
        return bookingRepository.findAllForOwner(ownerId).stream()
                .map(booking -> BookingResponse.from(booking, ownerId))
                .toList();
    }

    /** One booking, for its requester or the space owner. Anyone else gets a 403. */
    @Transactional(readOnly = true)
    public BookingResponse get(Long bookingId, Long viewerId) {
        Booking booking = bookingRepository.findDetailedById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking " + bookingId + " was not found."));

        if (!booking.involves(viewerId)) {
            throw new ForbiddenOperationException(
                    "Only the requester and the owner of the space can view this booking.");
        }

        return BookingResponse.from(booking, viewerId);
    }
}
