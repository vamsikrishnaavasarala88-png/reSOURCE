package com.resource.backend.service.storage;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.resource.backend.config.StorageProperties;
import com.resource.backend.exception.BadRequestException;

/**
 * Development friendly storage: images are written to a local directory and
 * served back through the {@code /api/files/spaces/**} resource handler.
 *
 * <p>Only the file name is stored in the database, and the name is generated
 * here (never taken from the client), which keeps uploads inside the storage
 * directory.</p>
 */
@Service
@ConditionalOnProperty(name = "app.storage.type", havingValue = "local", matchIfMissing = true)
public class LocalPhotoStorageService implements PhotoStorageService {

    private static final Logger log = LoggerFactory.getLogger(LocalPhotoStorageService.class);

    private static final Map<String, String> ALLOWED_TYPES = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp");

    private final Path directory;
    private final String publicBasePath;
    private final long maxFileSizeBytes;

    public LocalPhotoStorageService(StorageProperties properties) {
        this.directory = Path.of(properties.localDirectory()).toAbsolutePath().normalize();
        this.publicBasePath = properties.publicBasePath();
        this.maxFileSizeBytes = properties.maxFileSizeBytes();

        try {
            Files.createDirectories(this.directory);
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Could not create the photo storage directory " + this.directory, exception);
        }
    }

    /** Absolute directory, used by the resource handler. */
    public Path getDirectory() {
        return directory;
    }

    @Override
    public StoredPhoto store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("The uploaded image is empty.");
        }

        if (file.getSize() > maxFileSizeBytes) {
            throw new BadRequestException(
                    "Each image must be at most " + (maxFileSizeBytes / (1024 * 1024)) + " MB.");
        }

        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        String extension = ALLOWED_TYPES.get(contentType);

        if (extension == null) {
            throw new BadRequestException("Only JPEG, PNG and WebP images can be uploaded.");
        }

        String key = UUID.randomUUID() + extension;
        Path target = directory.resolve(key).normalize();

        if (!target.startsWith(directory)) {
            throw new BadRequestException("Invalid file name.");
        }

        try (InputStream input = file.getInputStream()) {
            Files.copy(input, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new BadRequestException("The image could not be saved. Please try again.");
        }

        return new StoredPhoto(key, publicBasePath + "/" + key);
    }

    @Override
    public void delete(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return;
        }

        Path target = directory.resolve(storageKey).normalize();

        if (!target.startsWith(directory)) {
            log.warn("Refused to delete a file outside the storage directory");
            return;
        }

        try {
            Files.deleteIfExists(target);
        } catch (IOException exception) {
            // The listing must not fail because a file could not be removed.
            log.warn("Could not delete stored photo {}", storageKey);
        }
    }
}
