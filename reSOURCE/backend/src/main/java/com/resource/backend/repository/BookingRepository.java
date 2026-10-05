package com.resource.backend.repository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.resource.backend.entity.Booking;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    /**
     * Confirmed bookings of a space that overlap the given slot.
     *
     * <p>The rule is {@code start1 < end2 AND start2 < end1}, so the end time is
     * exclusive and back to back bookings (10:00-14:00 and 14:00-16:00) are
     * allowed. The same rule is enforced by a database constraint on PostgreSQL
     * ({@code ex_bookings_no_overlap}).</p>
     */
    @Query("""
            select b from Booking b
            where b.space.id = :spaceId
              and b.status = com.resource.backend.entity.BookingStatus.CONFIRMED
              and b.bookingDate = :bookingDate
              and b.startTime < :endTime
              and b.endTime > :startTime
            """)
    List<Booking> findConfirmedOverlaps(
            @Param("spaceId") Long spaceId,
            @Param("bookingDate") LocalDate bookingDate,
            @Param("startTime") LocalTime startTime,
            @Param("endTime") LocalTime endTime);

    /** Bookings the user made as a requester. */
    @Query("""
            select b from Booking b
            join fetch b.space
            join fetch b.owner
            join fetch b.requester
            where b.requester.id = :requesterId
            order by b.bookingDate desc, b.startTime desc, b.id desc
            """)
    List<Booking> findAllForRequester(@Param("requesterId") Long requesterId);

    /** Bookings for the spaces the user owns. */
    @Query("""
            select b from Booking b
            join fetch b.space
            join fetch b.owner
            join fetch b.requester
            where b.owner.id = :ownerId
            order by b.bookingDate desc, b.startTime desc, b.id desc
            """)
    List<Booking> findAllForOwner(@Param("ownerId") Long ownerId);

    @Query("""
            select b from Booking b
            join fetch b.space
            join fetch b.owner
            join fetch b.requester
            where b.id = :id
            """)
    java.util.Optional<Booking> findDetailedById(@Param("id") Long id);
}
