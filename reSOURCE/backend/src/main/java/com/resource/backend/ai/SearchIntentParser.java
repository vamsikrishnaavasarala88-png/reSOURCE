package com.resource.backend.ai;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.resource.backend.ai.dto.SearchIntent;
import com.resource.backend.ai.dto.SearchIntentResponse;
import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.entity.ResourceType;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Turns a sentence into a {@link SearchIntent}.
 *
 * <p>Two jobs, kept apart on purpose: the prompt asks the model for one flat JSON
 * object, and {@link #sanitize} then treats that answer as untrusted input. An
 * unknown category never reaches a query, a negative price becomes
 * {@code null}, coordinates outside their range are dropped, and everything the
 * user did not say stays {@code null} instead of being guessed.</p>
 */
@Component
public class SearchIntentParser {

    private static final int MAX_RADIUS_KM = 500;
    private static final int MAX_CAPACITY = 1_000_000;
    private static final int MAX_UNIT_LENGTH = 20;
    private static final int MAX_LOCATION_LENGTH = 120;

    /** Nothing a space can be is larger than this; a bigger number is a mistake. */
    private static final BigDecimal MAX_AREA_SQFT = new BigDecimal("10000000");

    /** At most this many facilities are ever applied, however many arrive. */
    private static final int MAX_FACILITIES = 9;

    private static final String SYSTEM_PROMPT = """
            You turn a marketplace search into JSON filters.

            Both marketplaces exist:
            - SPACE: places to hold an event (grounds, halls, terraces).
            - MATERIAL: surplus construction material (bricks, cement, tiles, wood, metal, pipes, sand, stone).

            Reply with one JSON object and nothing else, using exactly these keys:
            {"resourceType": null, "activity": null, "category": null, "condition": null,
             "maxPrice": null, "minQuantity": null, "maxQuantity": null, "quantityUnit": null,
             "capacity": null, "facilities": [], "minAreaSqft": null, "maxAreaSqft": null,
             "radiusKm": null, "date": null, "latitude": null, "longitude": null,
             "freeOnly": null, "locationText": null}

            Rules:
            - Fill a field only when the user's words support it. Everything else stays null.
            - Never invent a price, a quantity, a capacity, a distance or a date.
            - "free", "no cost", "for free" -> freeOnly true and maxPrice 0.
            - A budget in rupees -> maxPrice.
            - People attending -> capacity. Materials -> category.
            - Places for a SPACE -> facilities, using only the allowed spellings below.
              "with parking and washrooms" -> facilities ["PARKING","WASHROOMS"].
              A space that merely mentions a word is not offering it; only the
              facilities the user asks the space to have belong in this list.
            - A size the space must be -> minAreaSqft. A size it must not exceed -> maxAreaSqft.
              Square feet is the unit; convert from square metres or acres.
              "at least 2000 sq ft" -> minAreaSqft 2000. "a big ground" -> both stay null.
            - Distances in kilometres -> radiusKm (a number, no unit).
            - Dates -> ISO format yyyy-MM-dd. Relative words like "next week" stay null.
            - locationText is the place named by the user, copied as written, or null.

            Allowed values (use exactly these spellings, otherwise null):
            resourceType: SPACE, MATERIAL
            facilities: %s
            activity: %s
            category: %s
            condition: %s
            quantityUnit: a short unit word the user used, for example pieces, bags, kg, tonnes, boards, pipes
            """.formatted(
            names(Facility.values()),
            names(ActivityType.values()),
            names(MaterialCategory.values()),
            names(MaterialCondition.values()));

    private final AiProvider aiProvider;
    private final AiProperties properties;
    private final ObjectMapper objectMapper;

    public SearchIntentParser(AiProvider aiProvider, AiProperties properties, ObjectMapper objectMapper) {
        this.aiProvider = aiProvider;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /**
     * A validated intent plus what the model thought the query was about.
     *
     * @param intent   the filters, already sanitized for {@code requested}
     * @param detected the marketplace the model guessed, which may differ from the
     *                 one the page is showing
     */
    public record ParsedIntent(SearchIntent intent, ResourceType detected) {
    }

    /**
     * Asks the provider for a structured intent and validates every field of it.
     *
     * @param query     the user's words
     * @param requested the marketplace the results will come from; it is never
     *                  changed by the model, because the page the user is on is
     *                  the context - a material guess only becomes a hint
     */
    public ParsedIntent parse(String query, ResourceType requested) {
        JsonNode raw = AiJson.parseObject(objectMapper,
                aiProvider.completeJson(
                        AiPrompt.search(SYSTEM_PROMPT, query, properties.searchReadTimeoutMs())));

        ResourceType detected = enumValue(ResourceType.class, AiJson.text(raw, "resourceType"));

        return new ParsedIntent(sanitize(raw, query, requested), detected);
    }

    /** Wraps a validated intent in the chips and the one-line summary the UI shows. */
    public SearchIntentResponse describe(SearchIntent intent, ResourceType requested, ResourceType detected) {
        return new SearchIntentResponse(
                requested,
                detected == null || detected == requested ? null : detected,
                intent,
                chips(intent),
                summary(intent, requested),
                null);
    }

    // ------------------------------------------------------------- validation

    SearchIntent sanitize(JsonNode raw, String query, ResourceType requested) {
        ResourceType resourceType = requested;
        ActivityType activity = enumValue(ActivityType.class, AiJson.text(raw, "activity"));
        MaterialCategory category = enumValue(MaterialCategory.class, AiJson.text(raw, "category"));
        MaterialCondition condition = enumValue(MaterialCondition.class, AiJson.text(raw, "condition"));

        BigDecimal maxPrice = nonNegative(AiJson.number(raw, "maxPrice"));
        BigDecimal minQuantity = positive(AiJson.number(raw, "minQuantity"));
        BigDecimal maxQuantity = positive(AiJson.number(raw, "maxQuantity"));

        // A range that arrived upside down is not a range; keep the tighter half.
        if (minQuantity != null && maxQuantity != null && minQuantity.compareTo(maxQuantity) > 0) {
            BigDecimal swap = minQuantity;
            minQuantity = maxQuantity;
            maxQuantity = swap;
        }

        String quantityUnit = shortText(AiJson.text(raw, "quantityUnit"), MAX_UNIT_LENGTH);
        Integer capacity = capacity(AiJson.number(raw, "capacity"));
        List<Facility> facilities = facilities(raw);
        BigDecimal minAreaSqft = area(AiJson.number(raw, "minAreaSqft"));
        BigDecimal maxAreaSqft = area(AiJson.number(raw, "maxAreaSqft"));

        // A size range that arrived upside down is not a range; keep the tighter half.
        if (minAreaSqft != null && maxAreaSqft != null && minAreaSqft.compareTo(maxAreaSqft) > 0) {
            BigDecimal swap = minAreaSqft;
            minAreaSqft = maxAreaSqft;
            maxAreaSqft = swap;
        }

        Double radiusKm = radius(AiJson.number(raw, "radiusKm"));
        LocalDate date = futureDate(AiJson.text(raw, "date"));

        // Coordinates from the model are guesses about the world, not something
        // the user said, so they are never used: a distance search runs on the
        // browser's own coordinates, and everything else stays text.
        BigDecimal latitude = null;
        BigDecimal longitude = null;

        Boolean freeOnly = AiJson.bool(raw, "freeOnly");

        if (Boolean.TRUE.equals(freeOnly) && maxPrice == null) {
            // "free" is a budget of zero, whether or not the model said so.
            maxPrice = BigDecimal.ZERO;
        }

        String locationText = shortText(AiJson.text(raw, "locationText"), MAX_LOCATION_LENGTH);

        // A material-only filter on a space search, or the other way round, would
        // silently return nothing; drop what does not fit the marketplace.
        if (resourceType == ResourceType.SPACE) {
            category = null;
            condition = null;
            minQuantity = null;
            maxQuantity = null;
            quantityUnit = null;
        }

        if (resourceType == ResourceType.MATERIAL) {
            activity = null;
            capacity = null;
            facilities = List.of();
            minAreaSqft = null;
            maxAreaSqft = null;
        }

        return new SearchIntent(resourceType, activity, category, condition, maxPrice,
                minQuantity, maxQuantity, quantityUnit, capacity, facilities, minAreaSqft, maxAreaSqft,
                radiusKm, date, latitude, longitude, freeOnly, locationText, query);
    }

    /**
     * The facilities the model picked out, as enum values.
     *
     * <p>A name that is not a facility this marketplace knows is dropped, never
     * mapped onto something similar: an unknown word must not become a filter the
     * user did not ask for. Duplicates collapse and the list is capped, so a long
     * answer cannot turn into a long query.</p>
     */
    private static List<Facility> facilities(JsonNode raw) {
        JsonNode node = raw == null ? null : raw.get("facilities");

        if (node == null || !node.isArray()) {
            return List.of();
        }

        Set<Facility> values = new LinkedHashSet<>();

        for (JsonNode entry : node) {
            if (values.size() >= MAX_FACILITIES) {
                break;
            }

            if (entry.isTextual()) {
                Facility facility = enumValue(Facility.class, entry.asString());

                if (facility != null) {
                    values.add(facility);
                }
            }
        }

        return List.copyOf(values);
    }

    /** An area in square feet: positive, within reason, otherwise {@code null}. */
    private static BigDecimal area(BigDecimal value) {
        if (value == null || value.signum() <= 0) {
            return null;
        }

        return value.compareTo(MAX_AREA_SQFT) > 0 ? null : value;
    }

    // ------------------------------------------------------------------ chips

    /** Labels the UI shows as filter chips, built from the validated intent only. */
    List<String> chips(SearchIntent intent) {
        List<String> chips = new ArrayList<>();

        if (intent.activity() != null) {
            chips.add(intent.activity().getLabel());
        }
        if (intent.category() != null) {
            chips.add(intent.category().getLabel());
        }
        if (intent.condition() != null) {
            chips.add(intent.condition().getLabel());
        }
        if (Boolean.TRUE.equals(intent.freeOnly()) || isZero(intent.maxPrice())) {
            chips.add("Free");
        } else if (intent.maxPrice() != null) {
            chips.add("Up to ₹" + plain(intent.maxPrice()));
        }
        if (intent.capacity() != null) {
            chips.add(intent.capacity() + " people");
        }
        if (!intent.facilities().isEmpty()) {
            chips.add("With " + intent.facilities().stream()
                    .map(Facility::getLabel)
                    .collect(Collectors.joining(", ")));
        }
        if (intent.minAreaSqft() != null) {
            chips.add("From " + plain(intent.minAreaSqft()) + " sq ft");
        }
        if (intent.maxAreaSqft() != null) {
            chips.add("Up to " + plain(intent.maxAreaSqft()) + " sq ft");
        }
        if (intent.minQuantity() != null) {
            chips.add("At least " + plain(intent.minQuantity()) + unit(intent));
        }
        if (intent.maxQuantity() != null) {
            chips.add("At most " + plain(intent.maxQuantity()) + unit(intent));
        }
        if (intent.radiusKm() != null) {
            chips.add("Within " + plain(intent.radiusKm()) + " km");
        }
        if (intent.date() != null) {
            chips.add("On " + intent.date());
        }
        if (intent.locationText() != null) {
            chips.add(intent.locationText());
        }

        return chips;
    }

    /** One sentence of transparency - never a claim about how good the match is. */
    private String summary(SearchIntent intent, ResourceType requested) {
        String subject = requested == ResourceType.MATERIAL ? "materials" : "spaces";

        List<String> chips = chips(intent);

        if (chips.isEmpty()) {
            return "Showing all " + subject + ": nothing specific was picked out of your words.";
        }

        return "Showing " + subject + " matching: " + String.join(" · ", chips);
    }

    // ---------------------------------------------------------------- helpers

    private static String names(Enum<?>[] values) {
        return String.join(", ", Arrays.stream(values).map(Enum::name).toList());
    }

    /** Case-insensitive enum lookup; anything unrecognised becomes null. */
    private static <E extends Enum<E>> E enumValue(Class<E> type, String raw) {
        if (raw == null) {
            return null;
        }

        String candidate = raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');

        try {
            return Enum.valueOf(type, candidate);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static BigDecimal nonNegative(BigDecimal value) {
        return value == null || value.signum() < 0 ? null : value;
    }

    private static BigDecimal positive(BigDecimal value) {
        return value == null || value.signum() <= 0 ? null : value;
    }

    private static Integer capacity(BigDecimal value) {
        if (value == null || value.signum() <= 0) {
            return null;
        }

        int rounded = value.intValue();

        return rounded > MAX_CAPACITY ? null : rounded;
    }

    private static Double radius(BigDecimal value) {
        if (value == null || value.signum() <= 0) {
            return null;
        }

        double kilometres = value.doubleValue();

        return kilometres > MAX_RADIUS_KM ? null : kilometres;
    }

    /** A date in the past is not a useful filter, so it is dropped. */
    private static LocalDate futureDate(String raw) {
        if (raw == null) {
            return null;
        }

        try {
            LocalDate parsed = LocalDate.parse(raw.trim());
            return parsed.isBefore(LocalDate.now()) ? null : parsed;
        } catch (DateTimeParseException exception) {
            return null;
        }
    }

    private static String shortText(String value, int maxLength) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();

        if (trimmed.isEmpty()) {
            return null;
        }

        return trimmed.length() > maxLength ? trimmed.substring(0, maxLength) : trimmed;
    }

    private static boolean isZero(BigDecimal value) {
        return value != null && value.signum() == 0;
    }

    private static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static String plain(Double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    private static String unit(SearchIntent intent) {
        return intent.quantityUnit() == null ? "" : " " + intent.quantityUnit();
    }
}
