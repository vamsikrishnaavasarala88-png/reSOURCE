package com.resource.backend.service.storage;

import org.springframework.web.multipart.MultipartFile;

/**
 * Stores space images outside the database.
 *
 * <p>Implementations: local development storage today, a hosted provider later.
 * The rest of the application only depends on this interface.</p>
 */
public interface PhotoStorageService {

    /**
     * Validates and stores one image.
     *
     * @throws com.resource.backend.exception.BadRequestException when the file is
     *         empty, too large or not a supported image type
     */
    StoredPhoto store(MultipartFile file);

    /** Removes a previously stored image. Missing files are ignored. */
    void delete(String storageKey);
}
