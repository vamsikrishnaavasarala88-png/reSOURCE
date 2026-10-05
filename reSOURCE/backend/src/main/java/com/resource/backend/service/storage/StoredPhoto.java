package com.resource.backend.service.storage;

/**
 * Result of storing one uploaded file.
 *
 * @param key storage key used to delete the file later
 * @param url public URL the frontend can load
 */
public record StoredPhoto(String key, String url) {
}
