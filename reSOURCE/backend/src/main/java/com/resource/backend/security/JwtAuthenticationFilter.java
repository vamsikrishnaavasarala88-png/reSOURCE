package com.resource.backend.security;

import java.io.IOException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.resource.backend.entity.User;
import com.resource.backend.repository.UserRepository;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Reads the access token from {@code Authorization: Bearer <JWT>}, or from the
 * {@code X-Auth-Token} header when that one is missing, and - when the token is
 * valid - puts the matching user into the security context.
 *
 * <p>The second header exists because some hosting and preview proxies drop the
 * {@code Authorization} header on the way to the API, which makes otherwise
 * valid signed-in requests arrive anonymous. Both headers carry the same token
 * and are verified exactly the same way; neither is trusted.</p>
 *
 * <p>Requests without a token (or with an invalid/expired one) simply continue
 * unauthenticated; the filter chain's entry point then answers with 401 for
 * protected endpoints. Refusals are logged (without the token itself) so a
 * broken sign-in can be traced.</p>
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private static final String BEARER_PREFIX = "Bearer ";

    /** Accepted as a fallback for proxies that strip {@code Authorization}. */
    private static final String TOKEN_HEADER = "X-Auth-Token";

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        bearerToken(request).ifPresent(token -> {
            Optional<Long> userId = jwtService.extractUserId(token);

            if (userId.isEmpty()) {
                // JwtService has already said why the token was refused.
                return;
            }

            Optional<User> user = userRepository.findById(userId.get());

            if (user.isEmpty()) {
                log.warn(
                        "Access token accepted but user {} no longer exists: {} {}",
                        userId.get(),
                        request.getMethod(),
                        request.getRequestURI());
                return;
            }

            authenticate(user.get(), request);
        });

        filterChain.doFilter(request, response);
    }

    private Optional<String> bearerToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);

        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String token = header.substring(BEARER_PREFIX.length()).trim();

            if (!token.isEmpty()) {
                return Optional.of(token);
            }
        }

        String fallback = request.getHeader(TOKEN_HEADER);

        if (fallback != null && !fallback.isBlank()) {
            return Optional.of(fallback.trim());
        }

        return Optional.empty();
    }

    private void authenticate(User user, HttpServletRequest request) {
        if (SecurityContextHolder.getContext().getAuthentication() != null) {
            return;
        }

        ResourceUserDetails principal = new ResourceUserDetails(user);
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
