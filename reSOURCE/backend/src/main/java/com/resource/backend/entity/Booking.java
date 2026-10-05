package com.resource.backend.entity;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * A confirmed booking of a space, created when the owner accepts a request.
 *
 * <p>Exactly one booking exists per request (unique constraint on
 * {@code request_id}). The money fields are copied from the owner's
 * {@link SpacePricing} at acceptance time: {@code amount} is the owner's price
 * (0 when the owner marked the activity free), {@code platformFee} stays 0 in
 * phase 4 because no payment processing exists, and {@code totalAmount} is their
 * sum. Nothing here claims that money changed hands.</p>
 *
 * <p>A booking covers a single date with a start and end time; the end time is
 * exclusive, so 10:00-14:00 and 14:00-16:00 do not conflict.</p>
 */
@Entity
@Table(name = "bookings",
        uniqueConstraints = @UniqueConstraint(name = "uk_bookings_request", columnNames = "request_id"))
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "request_id", nullable = false)
    private SpaceRequest request;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "space_id", nullable = false)
    private Space space;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false)
    private User requester;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 20)
    private ResourceType resourceType = ResourceType.SPACE;

    @Column(name = "resource_id", nullable = false)
    private Long resourceId;

    @Column(name = "booking_date", nullable = false)
    private LocalDate bookingDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(name = "platform_fee", nullable = false, precision = 12, scale = 2)
    private BigDecimal platformFee = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private BookingStatus status = BookingStatus.CONFIRMED;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Booking() {
        // for JPA
    }

    public Booking(SpaceRequest request, BigDecimal amount, BigDecimal platformFee) {
        this.request = request;
        this.space = request.getSpace();
        this.owner = request.getSpace().getOwner();
        this.requester = request.getRequester();
        this.resourceType = ResourceType.SPACE;
        this.resourceId = request.getSpace().getId();
        this.bookingDate = request.getRequestDate();
        this.startTime = request.getStartTime();
        this.endTime = request.getEndTime();
        this.amount = amount == null ? BigDecimal.ZERO : amount;
        this.platformFee = platformFee == null ? BigDecimal.ZERO : platformFee;
        this.totalAmount = this.amount.add(this.platformFee);
        this.status = BookingStatus.CONFIRMED;
        // Both sides of the association: the request is the inverse side, and the
        // accept response is built before the context is reloaded.
        request.attachBooking(this);
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /** True when {@code userId} is one of the two parties of the booking. */
    public boolean involves(Long userId) {
        if (userId == null) {
            return false;
        }

        return userId.equals(requester != null ? requester.getId() : null)
                || userId.equals(owner != null ? owner.getId() : null);
    }

    public boolean isConfirmed() {
        return status == BookingStatus.CONFIRMED;
    }

    public Long getId() {
        return id;
    }

    public SpaceRequest getRequest() {
        return request;
    }

    public Space getSpace() {
        return space;
    }

    public User getOwner() {
        return owner;
    }

    public User getRequester() {
        return requester;
    }

    public ResourceType getResourceType() {
        return resourceType;
    }

    public Long getResourceId() {
        return resourceId;
    }

    public LocalDate getBookingDate() {
        return bookingDate;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public BigDecimal getPlatformFee() {
        return platformFee;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public BookingStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Booking booking)) {
            return false;
        }
        return id != null && id.equals(booking.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
