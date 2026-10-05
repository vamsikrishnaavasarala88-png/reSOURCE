package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

import javax.crypto.SecretKey;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.ObjectMapper;
import com.resource.backend.entity.User;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.UserRepository;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * End-to-end tests for the Phase 2 authentication flow.
 *
 * <p>Runs against an in-memory H2 database (PostgreSQL compatibility mode) with
 * the production Flyway migration applied, so the {@code users} table is
 * created exactly as it is in PostgreSQL.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:resource-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=" + AuthenticationFlowTest.TEST_SECRET,
        "app.jwt.expiration-minutes=60",
        // A developer .env may enable seeding; tests must never seed.
        "app.seed.enabled=false",
        // .env is loaded even here, so the PostgreSQL-only migration folder is
        // explicitly excluded: these tests run the portable migrations on H2.
        "spring.flyway.locations=classpath:db/migration"
})
@AutoConfigureMockMvc
class AuthenticationFlowTest {

    static final String TEST_SECRET = "integration-test-secret-long-enough-for-hs256-signing";

    private static final String PASSWORD = "StrongPass123";
    private static final String RAW_USER = """
            {"name":"Ada Lovelace","email":"ada@example.com","phone":"+91 98765 43210","password":"%s"}
            """.formatted(PASSWORD);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SpaceRepository spaceRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void cleanDatabase() {
        // `spaces.owner_id` references `users.id`, so listings are removed first.
        spaceRepository.deleteAll();
        userRepository.deleteAll();
    }

    // ---------------------------------------------------------------- register

    @Test
    void registerCreatesTheUserWithAHashInsteadOfAPassword() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(RAW_USER))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Ada Lovelace"))
                .andExpect(jsonPath("$.email").value("ada@example.com"))
                .andExpect(jsonPath("$.phone").value("+91 98765 43210"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist());

        User stored = userRepository.findByEmailIgnoreCase("ada@example.com").orElseThrow();
        assertThat(stored.getPasswordHash()).isNotEqualTo(PASSWORD);
        assertThat(stored.getPasswordHash()).startsWith("$2");
        assertThat(passwordEncoder.matches(PASSWORD, stored.getPasswordHash())).isTrue();
        assertThat(stored.getCreatedAt()).isNotNull();
        assertThat(stored.getUpdatedAt()).isNotNull();
    }

    @Test
    void registerStoresEmailsLowerCased() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(RAW_USER.replace("ada@example.com", "Ada@Example.COM")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("ada@example.com"));
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        registerAda();

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(RAW_USER))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("An account with the email ada@example.com already exists."))
                .andExpect(jsonPath("$.errors.email").value("This email is already registered."));

        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void duplicateEmailIsRejectedRegardlessOfCase() throws Exception {
        registerAda();

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(RAW_USER.replace("ada@example.com", "ADA@example.com")))
                .andExpect(status().isConflict());
    }

    @Test
    void registerRejectsInvalidInput() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"","email":"not-an-email","phone":"abc","password":"short"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.phone").exists())
                .andExpect(jsonPath("$.errors.password").exists());

        assertThat(userRepository.count()).isZero();
    }

    // ------------------------------------------------------------------- login

    @Test
    void loginReturnsABearerToken() throws Exception {
        registerAda();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("ada@example.com", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.email").value("ada@example.com"))
                .andExpect(jsonPath("$.user.role").value("USER"))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist());
    }

    @Test
    void loginIsCaseInsensitiveForTheEmail() throws Exception {
        registerAda();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("ADA@example.com", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void wrongPasswordIsRejected() throws Exception {
        registerAda();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("ada@example.com", "WrongPass123")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password."))
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test
    void unknownEmailIsRejectedWithTheSameMessage() throws Exception {
        registerAda();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("nobody@example.com", PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password."));
    }

    @Test
    void loginRequiresEmailAndPassword() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists());
    }

    // --------------------------------------------------------------- protected

    @Test
    void protectedEndpointsRejectMissingInvalidAndExpiredTokens() throws Exception {
        registerAda();

        mockMvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ada","email":"ada@example.com"}
                                """))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + expiredToken()))
                .andExpect(status().isUnauthorized());

        String token = login("ada@example.com", PASSWORD);
        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token + "tampered"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validTokenGrantsAccessToAuthMeAndUsersMe() throws Exception {
        registerAda();
        String token = login("ada@example.com", PASSWORD);

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ada@example.com"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mockMvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ada@example.com"));
    }

    @Test
    void tokenOfADeletedUserNoLongerWorks() throws Exception {
        registerAda();
        String token = login("ada@example.com", PASSWORD);
        userRepository.deleteAll();

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    // ----------------------------------------------------------------- profile

    @Test
    void profileCanBeUpdated() throws Exception {
        registerAda();
        String token = login("ada@example.com", PASSWORD);

        mockMvc.perform(put("/api/users/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ada Byron","email":"ada.byron@example.com","phone":"+91 90000 11111"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ada Byron"))
                .andExpect(jsonPath("$.email").value("ada.byron@example.com"))
                .andExpect(jsonPath("$.phone").value("+91 90000 11111"))
                .andExpect(jsonPath("$.id").isNumber());

        mockMvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ada Byron"))
                .andExpect(jsonPath("$.email").value("ada.byron@example.com"));

        // The old email no longer logs in, the new one does.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("ada@example.com", PASSWORD)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("ada.byron@example.com", PASSWORD)))
                .andExpect(status().isOk());
    }

    @Test
    void profileUpdateRejectsAnEmailThatBelongsToSomeoneElse() throws Exception {
        registerAda();
        register("bob@example.com");
        String token = login("ada@example.com", PASSWORD);

        mockMvc.perform(put("/api/users/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Ada Lovelace","email":"bob@example.com","phone":"+91 98765 43210"}
                                """))
                .andExpect(status().isConflict());

        mockMvc.perform(get("/api/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.email").value("ada@example.com"));
    }

    @Test
    void profileUpdateRejectsInvalidInput() throws Exception {
        registerAda();
        String token = login("ada@example.com", PASSWORD);

        mockMvc.perform(put("/api/users/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"A","email":"nope","phone":"abc"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.phone").exists());
    }

    // ------------------------------------------------------------------ public

    @Test
    void healthEndpointStaysPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("reSOURCE"));
    }

    // ----------------------------------------------------------------- helpers

    private void registerAda() throws Exception {
        register("ada@example.com");
    }

    private void register(String email) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(RAW_USER.replace("ada@example.com", email)))
                .andExpect(status().isCreated());
    }

    private String login(String email, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(email, password)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        Map<?, ?> payload = objectMapper.readValue(body, Map.class);
        Object token = payload.get("accessToken");
        assertThat(token).isInstanceOf(String.class);
        return (String) token;
    }

    private String loginBody(String email, String password) {
        return """
                {"email":"%s","password":"%s"}
                """.formatted(email, password);
    }

    private String expiredToken() {
        SecretKey key = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));

        return Jwts.builder()
                .subject("1")
                .issuedAt(Date.from(Instant.now().minusSeconds(3600)))
                .expiration(Date.from(Instant.now().minusSeconds(60)))
                .signWith(key)
                .compact();
    }
}
