package com.resource.backend.entity;

import java.math.BigDecimal;

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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * The price of a space for one activity.
 *
 * <p>Pricing is activity specific on purpose: a community ground can cost
 * ₹500/day for a market and be free for a blood donation camp. Whether an
 * activity is free is the owner's decision - the platform never decides it.</p>
 */
@Entity
@Table(name = "space_pricing",
        uniqueConstraints = @UniqueConstraint(name = "uk_space_activity", columnNames = {"space_id", "activity_type"}))
public class SpacePricing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "space_id", nullable = false)
    private Space space;

    @Enumerated(EnumType.STRING)
    @Column(name = "activity_type", nullable = false, length = 40)
    private ActivityType activityType;

    /** Always non-negative; 0 when the activity is free. */
    @Column(name = "price", nullable = false, precision = 12, scale = 2)
    private BigDecimal price = BigDecimal.ZERO;

    @Column(name = "is_free", nullable = false)
    private boolean free;

    @Column(name = "owner_note", length = 500)
    private String ownerNote;

    protected SpacePricing() {
        // for JPA
    }

    public SpacePricing(ActivityType activityType, BigDecimal price, boolean free, String ownerNote) {
        this.activityType = activityType;
        this.price = free || price == null ? BigDecimal.ZERO : price;
        this.free = free;
        this.ownerNote = ownerNote;
    }

    void attachTo(Space space) {
        this.space = space;
    }

    /** Applies edited values to an existing pricing row. */
    void apply(BigDecimal price, boolean free, String ownerNote) {
        this.price = free || price == null ? BigDecimal.ZERO : price;
        this.free = free;
        this.ownerNote = ownerNote;
    }

    public Long getId() {
        return id;
    }

    public Space getSpace() {
        return space;
    }

    public ActivityType getActivityType() {
        return activityType;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public boolean isFree() {
        return free;
    }

    public String getOwnerNote() {
        return ownerNote;
    }
}
