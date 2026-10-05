package com.resource.backend.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Wires the AI settings and says once, at startup, whether the AI features can run. */
@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiConfig {

    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);

    @Bean
    ApplicationRunner reportAiConfiguration(AiProperties properties) {
        return arguments -> {
            if (properties.configured()) {
                log.info("AI features enabled (model={}, endpoint={})",
                        properties.model(), properties.baseUrl());
            } else {
                log.info("AI features disabled: no AI_API_KEY is set. The marketplaces and every "
                        + "manual path keep working; the AI endpoints answer with the fallback message.");
            }
        };
    }
}
