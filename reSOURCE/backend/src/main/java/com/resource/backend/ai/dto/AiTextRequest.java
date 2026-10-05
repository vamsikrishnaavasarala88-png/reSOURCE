package com.resource.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A block of the owner's own text - a listing written in words.
 *
 * @param text what the owner typed; the same cap as the database column keeps
 *             one oversized paste from being billed to the provider
 */
public record AiTextRequest(
        @NotBlank(message = "Describe the material in a sentence or two.")
        @Size(max = 1000, message = "Please keep the description under 1000 characters.")
        String text) {
}
