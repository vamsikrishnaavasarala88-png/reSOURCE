package com.resource.backend.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

import javax.crypto.SecretKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.resource.backend.config.JwtProperties;
import com.resource.backend.entity.User;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Issues and verifies the HS256 access tokens used by the API.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    private static final int MINIMUM_SECRET_BYTES = 32;

    private final SecretKey signingKey;
    private final Duration expiration;

    public JwtService(JwtProperties properties) {
        String secret = properties.secret();

        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT secret is not configured. Set the JWT_SECRET environment variable "
                            + "(see backend/.env.example).");
        }

        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < MINIMUM_SECRET_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET must be at least " + MINIMUM_SECRET_BYTES
                            + " characters long for HS256 signing.");
        }

        this.signingKey = Keys.hmacShaKeyFor(keyBytes);

        long minutes = properties.expirationMinutes() > 0 ? properties.expirationMinutes() : 120;
        this.expiration = Duration.ofMinutes(minutes);
    }

    /** Creates a signed token for the given user. */
    public String generateToken(User user) {
        Instant issuedAt = Instant.now();

        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("email", user.getEmail())
                .claim("role", user.getRole().name())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(issuedAt.plus(expiration)))
                .signWith(signingKey)
                .compact();
    }

    /**
     * Verifies the signature and expiry of a token.
     *
     * @return the user id carried by the token, or empty when the token is
     *         malformed, tampered with or expired
     */
    public Optional<Long> extractUserId(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            return Optional.of(Long.valueOf(claims.getSubject()));
        } catch (JwtException | IllegalArgumentException | NullPointerException ex) {
            // Never log the token itself: only why it was refused. Without this
            // an unusable token fails silently and every protected call answers
            // 401 with no trace of the reason.
            log.warn("Access token refused: {} - {}", ex.getClass().getSimpleName(), ex.getMessage());
            return Optional.empty();
        }
    }

    /** Token lifetime in seconds, exposed for documentation and tests. */
    public long getExpirationSeconds() {
        return expiration.toSeconds();
    }
}
