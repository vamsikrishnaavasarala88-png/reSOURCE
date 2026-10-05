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
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * One image of a material listing.
 *
 * <p>The file itself lives in the shared photo storage (the same service the
 * space marketplace uses); only the generated key and its public URL are stored
 * here.</p>
 */
@Entity
@Table(name = "material_photos")
public class MaterialPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "material_id")
    private Material material;

    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    @Column(name = "storage_key", length = 255)
    private String storageKey;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected MaterialPhoto() {
        // for JPA
    }

    public MaterialPhoto(String imageUrl, String storageKey, int displayOrder) {
        this.imageUrl = imageUrl;
        this.storageKey = storageKey;
        this.displayOrder = displayOrder;
    }

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Material getMaterial() {
        return material;
    }

    void setMaterial(Material material) {
        this.material = material;
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

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof MaterialPhoto photo)) {
            return false;
        }
        return id != null && id.equals(photo.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
