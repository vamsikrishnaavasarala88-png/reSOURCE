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

/**
 * A user's request for something someone else owns.
 *
 * <p>One table carries both kinds, told apart by {@link #resourceType}:</p>
 *
 * <ul>
 *   <li>a <strong>space</strong> request asks for a date and time range and an
 *       activity. {@link #purpose} is that activity and is the key that finds the
 *       owner's {@link SpacePricing} row, so the price always comes from the
 *       owner's configuration. Accepting one creates the {@link Booking}.</li>
 *   <li>a <strong>material</strong> request asks for a quantity of surplus
 *       material. It has no date, no time range and no activity, and accepting
 *       one creates no booking - nothing is scheduled and nothing is paid.</li>
 * </ul>
 *
 * <p>The requester is always the authenticated user who sent it: a requester id
 * from the client is never trusted.</p>
 */
@Entity
@Table(name = "requests")
public class SpaceRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false)
    private User requester;

    /** The requested space; {@code null} for a material request. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "space_id")
    private Space space;

    /** The requested material; {@code null} for a space request. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id")
    private Material material;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 20)
    private ResourceType resourceType = ResourceType.SPACE;

    /** Activity the space is needed for, stored as an {@link ActivityType} name. */
    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", length = 40)
    private ActivityType purpose;

    @Column(name = "request_date")
    private LocalDate requestDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "expected_people")
    private Integer expectedPeople;

    /** How much material the requester asked for; material requests only. */
    @Column(name = "quantity_requested", precision = 12, scale = 2)
    private BigDecimal quantityRequested;

    @Column(name = "message", length = 1000)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private RequestStatus status = RequestStatus.PENDING;

    @OneToOne(mappedBy = "request", fetch = FetchType.LAZY)
    private Booking booking;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SpaceRequest() {
        // for JPA
    }

    public SpaceRequest(User requester, Space space, ActivityType purpose, LocalDate requestDate,
            LocalTime startTime, LocalTime endTime, int expectedPeople, String message) {
        this.requester = requester;
        this.space = space;
        this.resourceType = ResourceType.SPACE;
        this.purpose = purpose;
        this.requestDate = requestDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.expectedPeople = expectedPeople;
        this.message = message;
        this.status = RequestStatus.PENDING;
    }

    /** A request for a quantity of surplus material. */
    public SpaceRequest(User requester, Material material, BigDecimal quantityRequested, String message) {
        this.requester = requester;
        this.material = material;
        this.resourceType = ResourceType.MATERIAL;
        this.quantityRequested = quantityRequested;
        this.message = message;
        this.status = RequestStatus.PENDING;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.status == null) {
            this.status = RequestStatus.PENDING;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * Links a newly created booking to this request in memory.
     *
     * <p>{@code booking} is the inverse side of the association, so saving a
     * {@link Booking} would not refresh it before the response is built - the
     * accept response would claim there is no booking. The Booking constructor
     * calls this to keep both sides consistent.</p>
     */
    void attachBooking(Booking booking) {
        this.booking = booking;
    }

    /** Marks the request as accepted. Only valid from {@code PENDING}. */
    public void markAccepted() {
        this.status = RequestStatus.ACCEPTED;
    }

    /** Marks the request as rejected. Only valid from {@code PENDING}. */
    public void markRejected() {
        this.status = RequestStatus.REJECTED;
    }

    /** Marks the request as cancelled by its requester. Only valid from {@code PENDING}. */
    public void markCancelled() {
        this.status = RequestStatus.CANCELLED;
    }

    public boolean isPending() {
        return status == RequestStatus.PENDING;
    }

    public boolean isAccepted() {
        return status == RequestStatus.ACCEPTED;
    }

    public boolean wasSentBy(Long userId) {
        return userId != null && requester != null && userId.equals(requester.getId());
    }

    /** True when {@code userId} owns the requested space or material. */
    public boolean isForOwner(Long userId) {
        if (userId == null) {
            return false;
        }

        if (resourceType == ResourceType.MATERIAL) {
            return material != null && material.isOwnedBy(userId);
        }

        return space != null && space.isOwnedBy(userId);
    }

    /** The user who owns the requested resource; the other party of the request. */
    public User getOwner() {
        if (resourceType == ResourceType.MATERIAL) {
            return material == null ? null : material.getOwner();
        }

        return space == null ? null : space.getOwner();
    }

    /** Title of the requested resource, used in lists and messages. */
    public String getResourceTitle() {
        if (resourceType == ResourceType.MATERIAL) {
            return material == null ? null : material.getTitle();
        }

        return space == null ? null : space.getTitle();
    }

    /** True for a request that asks for surplus material. */
    public boolean isMaterialRequest() {
        return resourceType == ResourceType.MATERIAL;
    }

    /** True when the user is either the requester or the space owner. */
    public boolean isVisibleTo(Long userId) {
        return wasSentBy(userId) || isForOwner(userId);
    }

    public Long getId() {
        return id;
    }

    public User getRequester() {
        return requester;
    }

    public Space getSpace() {
        return space;
    }

    public ResourceType getResourceType() {
        return resourceType;
    }

    public ActivityType getPurpose() {
        return purpose;
    }

    public LocalDate getRequestDate() {
        return requestDate;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }

    public Integer getExpectedPeople() {
        return expectedPeople;
    }

    public Material getMaterial() {
        return material;
    }

    public BigDecimal getQuantityRequested() {
        return quantityRequested;
    }

    public String getMessage() {
        return message;
    }

    public RequestStatus getStatus() {
        return status;
    }

    public Booking getBooking() {
        return booking;
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
        if (!(other instanceof SpaceRequest request)) {
            return false;
        }
        return id != null && id.equals(request.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
