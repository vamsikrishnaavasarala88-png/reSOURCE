package com.resource.backend.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One image of a space. Files are stored outside the database (see
 * {@code PhotoStorageService}); only the URL and the storage key are kept here.
 */
@Entity
@Table(name = "space_photos")
public class SpacePhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "space_id", nullable = false)
    private Space space;

    /** Public URL the frontend uses, e.g. {@code /api/files/spaces/<name>.jpg}. */
    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    /** Key inside the storage backend, used to delete the file. */
    @Column(name = "storage_key", length = 255)
    private String storageKey;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected SpacePhoto() {
        // for JPA
    }

    public SpacePhoto(String imageUrl, String storageKey, int displayOrder) {
        this.imageUrl = imageUrl;
        this.storageKey = storageKey;
        this.displayOrder = displayOrder;
        this.createdAt = Instant.now();
    }

    void attachTo(Space space) {
        this.space = space;
    }

    public Long getId() {
        return id;
    }

    public Space getSpace() {
        return space;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
