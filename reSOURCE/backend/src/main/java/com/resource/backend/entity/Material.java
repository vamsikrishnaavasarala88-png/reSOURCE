package com.resource.backend.entity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

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
 * Surplus construction material listed by its owner.
 *
 * <p>Every field that describes the material - category, quantity, unit,
 * condition and whether it is free - is entered by the owner. Nothing is
 * inferred, and the platform never decides a price: {@code isFree} is the
 * owner's decision and a paid listing carries the owner's own amount.</p>
 *
 * <p>A material is independent of the space marketplace: it is not tied to a
 * space, a booking or an activity.</p>
 */
@Entity
@Table(name = "materials")
public class Material {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "title", nullable = false, length = 160)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 40)
    private MaterialCategory category;

    @Column(name = "description", nullable = false, length = 2000)
    private String description;

    /** How much there is; positive, and only ever compared inside one unit. */
    @Column(name = "quantity", nullable = false, precision = 12, scale = 2)
    private BigDecimal quantity;

    /** Free text unit ("pieces", "kg", "bags"), entered by the owner. */
    @Column(name = "unit", nullable = false, length = 40)
    private String unit;

    @Enumerated(EnumType.STRING)
    @Column(name = "material_condition", nullable = false, length = 20)
    private MaterialCondition condition;

    /** The owner's price; always 0 for a free listing. */
    @Column(name = "price", nullable = false, precision = 12, scale = 2)
    private BigDecimal price = BigDecimal.ZERO;

    @Column(name = "is_free", nullable = false)
    private boolean free = false;

    @Column(name = "address", nullable = false, length = 300)
    private String address;

    @Column(name = "latitude", precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    @Column(name = "owner_note", length = 1000)
    private String ownerNote;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private MaterialStatus status = MaterialStatus.ACTIVE;

    @OneToMany(mappedBy = "material", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder ASC, id ASC")
    private List<MaterialPhoto> photos = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Material() {
        // for JPA
    }

    public Material(User owner, String title, MaterialCategory category, String description,
            BigDecimal quantity, String unit, MaterialCondition condition, String address) {
        this.owner = owner;
        this.title = title;
        this.category = category;
        this.description = description;
        this.quantity = quantity;
        this.unit = unit;
        this.condition = condition;
        this.address = address;
        this.status = MaterialStatus.ACTIVE;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.status == null) {
            this.status = MaterialStatus.ACTIVE;
        }
        if (this.price == null) {
            this.price = BigDecimal.ZERO;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    // ------------------------------------------------------------------ photos

    public void addPhoto(MaterialPhoto photo) {
        photos.add(photo);
        photo.setMaterial(this);
    }

    public void removePhoto(MaterialPhoto photo) {
        photos.remove(photo);
        photo.setMaterial(null);
    }

    /** Next display order, so a new photo always lands at the end of the gallery. */
    public int nextPhotoOrder() {
        return photos.stream()
                .map(MaterialPhoto::getDisplayOrder)
                .max(Comparator.naturalOrder())
                .orElse(-1) + 1;
    }

    // ------------------------------------------------------------------ writes

    public void setTitle(String title) {
        this.title = title;
    }

    public void setCategory(MaterialCategory category) {
        this.category = category;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    /**
     * Quantity is stored normalised: positive, at most two decimals. Rejecting
     * anything else happens in the service so the caller gets a readable message.
     */
    public void setQuantity(BigDecimal quantity) {
        this.quantity = quantity;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public void setCondition(MaterialCondition condition) {
        this.condition = condition;
    }

    /** Stores the owner's price; a free listing is normalised to 0. */
    public void setPrice(BigDecimal price, boolean free) {
        this.free = free;
        this.price = free || price == null ? BigDecimal.ZERO : price;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public void setLatitude(BigDecimal latitude) {
        if (latitude != null && (latitude.compareTo(BigDecimal.valueOf(-90)) < 0
                || latitude.compareTo(BigDecimal.valueOf(90)) > 0)) {
            throw new IllegalArgumentException("Latitude must be between -90 and 90.");
        }
        this.latitude = latitude;
    }

    public void setLongitude(BigDecimal longitude) {
        if (longitude != null && (longitude.compareTo(BigDecimal.valueOf(-180)) < 0
                || longitude.compareTo(BigDecimal.valueOf(180)) > 0)) {
            throw new IllegalArgumentException("Longitude must be between -180 and 180.");
        }
        this.longitude = longitude;
    }

    public void setOwnerNote(String ownerNote) {
        this.ownerNote = ownerNote;
    }

    public void setStatus(MaterialStatus status) {
        this.status = status;
    }

    /** Soft delete: the listing leaves the marketplace but keeps its history. */
    public void markDeleted() {
        this.status = MaterialStatus.DELETED;
    }

    // ------------------------------------------------------------------- reads

    public boolean isOwnedBy(Long userId) {
        return userId != null && owner != null && userId.equals(owner.getId());
    }

    public boolean isActive() {
        return status == MaterialStatus.ACTIVE;
    }

    public boolean isDeleted() {
        return status == MaterialStatus.DELETED;
    }

    /** The URL of the photo shown on cards, or {@code null} when there is none. */
    public String primaryImageUrl() {
        return photos.stream()
                .min(Comparator.comparing(MaterialPhoto::getDisplayOrder)
                        .thenComparing(MaterialPhoto::getId, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(MaterialPhoto::getImageUrl)
                .orElse(null);
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

    public MaterialCategory getCategory() {
        return category;
    }

    public String getDescription() {
        return description;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public String getUnit() {
        return unit;
    }

    public MaterialCondition getCondition() {
        return condition;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public boolean isFree() {
        return free;
    }

    public String getAddress() {
        return address;
    }

    public BigDecimal getLatitude() {
        return latitude;
    }

    public BigDecimal getLongitude() {
        return longitude;
    }

    public String getOwnerNote() {
        return ownerNote;
    }

    public MaterialStatus getStatus() {
        return status;
    }

    public List<MaterialPhoto> getPhotos() {
        return photos;
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
        if (!(other instanceof Material material)) {
            return false;
        }
        return id != null && id.equals(material.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
