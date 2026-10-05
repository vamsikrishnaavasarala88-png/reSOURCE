package com.resource.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.resource.backend.dto.HealthResponse;

class HealthServiceTest {

    private final HealthService healthService = new HealthService();

    @Test
    void reportsServiceAsUp() {
        HealthResponse health = healthService.getHealth();

        assertThat(health.status()).isEqualTo("UP");
        assertThat(health.service()).isEqualTo("reSOURCE");
    }
}
