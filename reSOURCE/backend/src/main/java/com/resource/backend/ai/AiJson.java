package com.resource.backend.ai;

import java.math.BigDecimal;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Defensive helpers for reading AI output.
 *
 * <p>AI output is untrusted input: a value may be missing, null, a string where
 * a number belongs, or the wrong type entirely. Every read here answers
 * {@code null} instead of throwing, and nothing is ever deserialized straight
 * into an entity - see {@link AiJson#parseObject}.</p>
 */
final class AiJson {

    private AiJson() {
    }

    /**
     * Parses provider output into a JSON object.
     *
     * <p>Models occasionally wrap JSON in markdown fences or add a sentence
     * around it, so the first balanced {@code {...}} block is extracted before
     * parsing. Anything that still fails, or that is not an object, is reported
     * as unusable rather than guessed at.</p>
     */
    static JsonNode parseObject(ObjectMapper mapper, String raw) {
        if (raw == null || raw.isBlank()) {
            throw new AiUnavailableException("malformed_output", "The AI provider returned an empty answer.");
        }

        String candidate = stripFences(raw.trim());
        JsonNode parsed = tryParse(mapper, candidate);

        if (parsed == null) {
            parsed = tryParse(mapper, firstJsonObject(candidate));
        }

        if (parsed == null || !parsed.isObject()) {
            throw new AiUnavailableException("malformed_output",
                    "The AI provider returned a response that is not a JSON object.");
        }

        return parsed;
    }

    /** A trimmed string value, or {@code null} when the field is absent, null or blank. */
    static String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);

        if (value == null || value.isNull()) {
            return null;
        }

        String text = value.isString() ? value.asString() : value.toString();

        return text == null || text.isBlank() ? null : text.trim();
    }

    /** A number, accepting the numeric strings some models emit. Null when unusable. */
    static BigDecimal number(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);

        if (value == null || value.isNull()) {
            return null;
        }

        if (value.isNumber()) {
            return value.decimalValue();
        }

        String text = text(node, field);

        if (text == null) {
            return null;
        }

        try {
            return new BigDecimal(text.replace("₹", "").replace(",", "").trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    /** A boolean, accepting "true"/"false" strings. Null when the field is absent. */
    static Boolean bool(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);

        if (value == null || value.isNull()) {
            return null;
        }

        if (value.isBoolean()) {
            return value.booleanValue();
        }

        String text = text(node, field);

        if (text == null) {
            return null;
        }

        return switch (text.toLowerCase()) {
            case "true", "yes" -> Boolean.TRUE;
            case "false", "no" -> Boolean.FALSE;
            default -> null;
        };
    }

    /** True when the provider sent a value for this field at all. */
    static boolean present(JsonNode node, String field) {
        return node != null && node.get(field) != null && !node.get(field).isNull();
    }

    private static JsonNode tryParse(ObjectMapper mapper, String json) {
        if (json == null || json.isBlank()) {
            return null;
        }

        try {
            return mapper.readTree(json);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    /** Removes ```json fences and everything outside them. */
    private static String stripFences(String raw) {
        String text = raw;

        if (text.startsWith("```")) {
            int firstBreak = text.indexOf('\n');
            text = firstBreak < 0 ? text.substring(3) : text.substring(firstBreak + 1);
            int closing = text.lastIndexOf("```");

            if (closing >= 0) {
                text = text.substring(0, closing);
            }
        }

        return text.trim();
    }

    /** The substring from the first '{' to its matching '}', ignoring braces in strings. */
    private static String firstJsonObject(String raw) {
        int start = raw.indexOf('{');

        if (start < 0) {
            return null;
        }

        int depth = 0;
        boolean inString = false;
        boolean escaped = false;

        for (int index = start; index < raw.length(); index++) {
            char character = raw.charAt(index);

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (character == '\\') {
                    escaped = true;
                } else if (character == '"') {
                    inString = false;
                }
                continue;
            }

            if (character == '"') {
                inString = true;
            } else if (character == '{') {
                depth++;
            } else if (character == '}') {
                depth--;

                if (depth == 0) {
                    return raw.substring(start, index + 1);
                }
            }
        }

        return null;
    }
}
