package com.resource.backend.entity;

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
 * A facility offered by a space, e.g. parking or water.
 */
@Entity
@Table(name = "space_facilities",
        uniqueConstraints = @UniqueConstraint(name = "uk_space_facility", columnNames = {"space_id", "facility"}))
public class SpaceFacility {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "space_id", nullable = false)
    private Space space;

    @Enumerated(EnumType.STRING)
    @Column(name = "facility", nullable = false, length = 40)
    private Facility facility;

    protected SpaceFacility() {
        // for JPA
    }

    SpaceFacility(Space space, Facility facility) {
        this.space = space;
        this.facility = facility;
    }

    public Long getId() {
        return id;
    }

    public Space getSpace() {
        return space;
    }

    public Facility getFacility() {
        return facility;
    }
}
