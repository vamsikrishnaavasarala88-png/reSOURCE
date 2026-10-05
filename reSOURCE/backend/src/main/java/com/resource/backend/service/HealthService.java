package com.resource.backend.service;

import com.resource.backend.dto.HealthResponse;
import org.springframework.stereotype.Service;

/**
 * Reports whether the reSOURCE backend is running.
 */
@Service
public class HealthService {

    private static final String STATUS_UP = "UP";
    private static final String SERVICE_NAME = "reSOURCE";

    public HealthResponse getHealth() {
        return new HealthResponse(STATUS_UP, SERVICE_NAME);
    }
}
