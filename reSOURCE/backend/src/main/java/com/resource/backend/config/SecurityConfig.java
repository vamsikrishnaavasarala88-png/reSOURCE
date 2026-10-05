package com.resource.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.resource.backend.repository.UserRepository;
import com.resource.backend.security.JwtAuthenticationFilter;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.security.RestAccessDeniedHandler;
import com.resource.backend.security.RestAuthenticationEntryPoint;

/**
 * Stateless JWT security for the API.
 *
 * <p>Public: {@code GET /api/health}, {@code POST /api/auth/register},
 * {@code POST /api/auth/login}. Everything else under {@code /api/**} requires a
 * valid bearer token.</p>
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            RestAuthenticationEntryPoint authenticationEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler) throws Exception {

        http
                // CORS preflight requests carry no Authorization header.
                .cors(Customizer.withDefaults())
                // No cookies or sessions: CSRF protection is not applicable.
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        // Uploaded photos (spaces and materials) are public, like the listings.
                        .requestMatchers(HttpMethod.GET, "/api/files/**").permitAll()
                        // Own listings need a token, even though browsing does not.
                        .requestMatchers(HttpMethod.GET, "/api/spaces/mine", "/api/materials/mine")
                        .authenticated()
                        // Browsing either marketplace stays public.
                        .requestMatchers(HttpMethod.GET,
                                "/api/spaces", "/api/spaces/search", "/api/spaces/*", "/api/spaces/*/pricing")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/materials", "/api/materials/search", "/api/materials/*")
                        .permitAll()
                        // AI search is public like the marketplaces. The listing AI
                        // tools (recognition, extraction, description) need a token,
                        // because they spend the API key on a signed-in user's behalf.
                        .requestMatchers(HttpMethod.POST, "/api/ai/search-intent").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** Used by the authentication manager during login. */
    @Bean
    UserDetailsService userDetailsService(UserRepository userRepository) {
        return email -> userRepository.findByEmailIgnoreCase(email)
                .map(ResourceUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid email or password."));
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }
}
