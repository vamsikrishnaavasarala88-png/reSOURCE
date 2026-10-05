package com.resource.backend.entity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * An underused space listed by a user.
 *
 * <p>The owner is always the authenticated user who created the listing - an
 * owner id from the client is never trusted. Pricing lives in
 * {@link SpacePricing} because a space costs different amounts (or nothing) for
 * different activities.</p>
 */
@Entity
@Table(name = "spaces")
public class Space {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "title", nullable = false, length = 160)
    private String title;

    @Column(name = "description", nullable = false, length = 2000)
    private String description;

    @Column(name = "address", nullable = false, length = 300)
    private String address;

    @Column(name = "latitude", precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    /** Area as entered by the owner, in {@link #areaUnit}. */
    @Column(name = "area", nullable = false, precision = 12, scale = 2)
    private BigDecimal area;

    @Enumerated(EnumType.STRING)
    @Column(name = "area_unit", nullable = false, length = 20)
    private AreaUnit areaUnit;

    /** Normalised area used by search filters and sorting. */
    @Column(name = "area_sqft", nullable = false, precision = 14, scale = 2)
    private BigDecimal areaSqft;

    @Column(name = "capacity", nullable = false)
    private Integer capacity;

    @Column(name = "availability", length = 500)
    private String availability;

    @Column(name = "owner_note", length = 1000)
    private String ownerNote;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SpaceStatus status = SpaceStatus.ACTIVE;

    @OneToMany(mappedBy = "space", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC, id ASC")
    private List<SpacePhoto> photos = new ArrayList<>();

    @OneToMany(mappedBy = "space", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<SpaceFacility> facilities = new LinkedHashSet<>();

    @OneToMany(mappedBy = "space", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<SpacePricing> pricing = new LinkedHashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Space() {
        // for JPA
    }

    public Space(User owner, String title, String description, String address) {
        this.owner = owner;
        this.title = title;
        this.description = description;
        this.address = address;
        this.status = SpaceStatus.ACTIVE;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.status == null) {
            this.status = SpaceStatus.ACTIVE;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * Updates the facility set in place.
     *
     * <p>Updating the existing collection (instead of clearing and re-adding)
     * keeps Hibernate from inserting duplicates of rows it has not deleted yet,
     * which would break the {@code (space_id, facility)} unique constraint.</p>
     */
    public void replaceFacilities(Set<Facility> newFacilities) {
        facilities.removeIf(entry -> !newFacilities.contains(entry.getFacility()));

        Set<Facility> present = facilities.stream()
                .map(SpaceFacility::getFacility)
                .collect(java.util.stream.Collectors.toSet());

        newFacilities.stream()
                .filter(facility -> !present.contains(facility))
                .forEach(facility -> facilities.add(new SpaceFacility(this, facility)));
    }

    /** Updates the activity pricing in place, adding and removing rows as needed. */
    public void replacePricing(Set<SpacePricing> newPricing) {
        pricing.removeIf(entry -> newPricing.stream()
                .noneMatch(candidate -> candidate.getActivityType() == entry.getActivityType()));

        Map<ActivityType, SpacePricing> existing = pricing.stream()
                .collect(java.util.stream.Collectors.toMap(SpacePricing::getActivityType, entry -> entry));

        newPricing.forEach(candidate -> {
            SpacePricing current = existing.get(candidate.getActivityType());

            if (current == null) {
                candidate.attachTo(this);
                pricing.add(candidate);
            } else {
                current.apply(candidate.getPrice(), candidate.isFree(), candidate.getOwnerNote());
            }
        });
    }

    /** Next display position for a new photo. */
    public int nextPhotoOrder() {
        return photos.stream().mapToInt(SpacePhoto::getDisplayOrder).max().orElse(-1) + 1;
    }

    public void addPhoto(SpacePhoto photo) {
        photo.attachTo(this);
        photos.add(photo);
    }

    public void removePhoto(SpacePhoto photo) {
        photos.remove(photo);
    }

    public void markDeleted() {
        this.status = SpaceStatus.DELETED;
    }

    public boolean isOwnedBy(Long userId) {
        return userId != null && owner != null && userId.equals(owner.getId());
    }

    public Long getId() {
        return id;
    }

    public User getOwner() {
        return owner;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public BigDecimal getLatitude() {
        return latitude;
    }

    public void setLatitude(BigDecimal latitude) {
        this.latitude = latitude;
    }

    public BigDecimal getLongitude() {
        return longitude;
    }

    public void setLongitude(BigDecimal longitude) {
        this.longitude = longitude;
    }

    public BigDecimal getArea() {
        return area;
    }

    public void setArea(BigDecimal area, AreaUnit areaUnit) {
        this.area = area;
        this.areaUnit = areaUnit;
        this.areaSqft = areaUnit.toSquareFeet(area);
    }

    public AreaUnit getAreaUnit() {
        return areaUnit;
    }

    public BigDecimal getAreaSqft() {
        return areaSqft;
    }

    public Integer getCapacity() {
        return capacity;
    }

    public void setCapacity(Integer capacity) {
        this.capacity = capacity;
    }

    public String getAvailability() {
        return availability;
    }

    public void setAvailability(String availability) {
        this.availability = availability;
    }

    public String getOwnerNote() {
        return ownerNote;
    }

    public void setOwnerNote(String ownerNote) {
        this.ownerNote = ownerNote;
    }

    public SpaceStatus getStatus() {
        return status;
    }

    public void setStatus(SpaceStatus status) {
        this.status = status;
    }

    public List<SpacePhoto> getPhotos() {
        return photos;
    }

    public Set<SpaceFacility> getFacilities() {
        return facilities;
    }

    public Set<SpacePricing> getPricing() {
        return pricing;
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
        if (!(other instanceof Space space)) {
            return false;
        }
        return id != null && id.equals(space.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
