package com.resource.backend.dto;

/**
 * Payload returned by {@code GET /api/health}.
 *
 * @param status  service state, e.g. {@code UP}
 * @param service service name
 */
public record HealthResponse(String status, String service) {
}
