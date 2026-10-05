package com.resource.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.resource.backend.config.JwtProperties;
import com.resource.backend.entity.Role;
import com.resource.backend.entity.User;

class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-value-long-enough-for-hs256-signing";

    private final JwtService jwtService = new JwtService(new JwtProperties(SECRET, 60));

    @Test
    void generatedTokenCarriesTheUserIdAndExpiry() {
        User user = userWithId(42L);

        String token = jwtService.generateToken(user);

        assertThat(token).isNotBlank();
        assertThat(token.split("\\.")).hasSize(3);
        assertThat(jwtService.extractUserId(token)).contains(42L);
    }

    @Test
    void tamperedTokenIsRejected() {
        String token = jwtService.generateToken(userWithId(42L));

        assertThat(jwtService.extractUserId(token + "tampered")).isEmpty();
        assertThat(jwtService.extractUserId("not-a-jwt")).isEmpty();
        assertThat(jwtService.extractUserId("")).isEmpty();
    }

    @Test
    void tokenSignedWithAnotherSecretIsRejected() {
        JwtService other = new JwtService(
                new JwtProperties("a-completely-different-secret-value-of-sufficient-length", 60));

        assertThat(jwtService.extractUserId(other.generateToken(userWithId(7L)))).isEmpty();
    }

    @Test
    void missingSecretFailsFast() {
        assertThatThrownBy(() -> new JwtService(new JwtProperties("", 60)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");

        assertThatThrownBy(() -> new JwtService(new JwtProperties("too-short", 60)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least 32 characters");
    }

    @Test
    void expirationFallsBackToTwoHoursWhenUnset() {
        JwtService defaultExpiry = new JwtService(new JwtProperties(SECRET, 0));

        assertThat(defaultExpiry.getExpirationSeconds()).isEqualTo(120 * 60);
    }

    private User userWithId(Long id) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        when(user.getEmail()).thenReturn("ada@example.com");
        when(user.getRole()).thenReturn(Role.USER);
        return user;
    }
}
