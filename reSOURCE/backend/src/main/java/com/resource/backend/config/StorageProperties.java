package com.resource.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where uploaded space photos are kept.
 *
 * <p>Phase 3 uses the {@code local} storage type: files are written to a
 * directory on disk and served back over HTTP. A hosted provider (for example
 * Cloudinary) can be added later by implementing {@code PhotoStorageService}
 * and switching {@code STORAGE_TYPE}.</p>
 *
 * @param type             storage backend, currently {@code local}
 * @param localDirectory   directory for {@code local} storage
 * @param publicBasePath   URL prefix the files are served from
 * @param maxFileSizeBytes maximum size of one uploaded image
 */
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(
        String type,
        String localDirectory,
        String publicBasePath,
        long maxFileSizeBytes) {
}
