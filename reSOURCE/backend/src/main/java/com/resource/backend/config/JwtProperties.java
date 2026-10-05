package com.resource.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT settings, bound from {@code app.jwt.*}.
 *
 * <p>The secret has no default on purpose: it must be supplied through the
 * {@code JWT_SECRET} environment variable (see {@code backend/.env.example}), so
 * no signing key is ever committed to the repository. {@code JwtService} fails
 * fast when it is missing.</p>
 *
 * @param secret            HMAC signing secret, at least 32 characters (256 bits)
 * @param expirationMinutes access token lifetime in minutes
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, long expirationMinutes) {
}
