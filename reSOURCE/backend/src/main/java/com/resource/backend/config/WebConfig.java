package com.resource.backend.config;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.CorsRegistration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows the frontend to call the API from another origin while developing, and
 * serves locally stored space photos.
 */
@Configuration
@EnableConfigurationProperties(StorageProperties.class)
public class WebConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;
    private final String[] allowedOriginPatterns;
    private final StorageProperties storageProperties;

    public WebConfig(
            @Value("${app.cors.allowed-origins}") String allowedOrigins,
            @Value("${app.cors.allowed-origin-patterns:}") String allowedOriginPatterns,
            StorageProperties storageProperties) {
        this.allowedOrigins = split(allowedOrigins);
        this.allowedOriginPatterns = split(allowedOriginPatterns);
        this.storageProperties = storageProperties;
    }

    private static String[] split(String value) {
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(entry -> !entry.isEmpty())
                .toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        CorsRegistration registration = registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");

        // Patterns cover deployments behind a reverse proxy or a dynamic host,
        // for example https://*.example.com, without opening the API to everyone.
        if (allowedOriginPatterns.length > 0) {
            registration.allowedOriginPatterns(allowedOriginPatterns);
        }
    }

    /**
     * The same rules for the Spring Security filter chain, so preflight requests
     * to protected endpoints are answered before authentication is evaluated.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setMaxAge(3600L);

        if (allowedOriginPatterns.length > 0) {
            configuration.setAllowedOriginPatterns(List.of(allowedOriginPatterns));
        }

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }

    /**
     * Serves locally stored images. Only active when local storage is in use;
     * with a hosted provider the URLs point at the provider instead.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (!"local".equalsIgnoreCase(storageProperties.type())) {
            return;
        }

        Path directory = Path.of(storageProperties.localDirectory()).toAbsolutePath().normalize();
        String location = directory.toUri().toString();

        registry.addResourceHandler(storageProperties.publicBasePath() + "/**")
                .addResourceLocations(location)
                .setCachePeriod(3600);
    }
}
