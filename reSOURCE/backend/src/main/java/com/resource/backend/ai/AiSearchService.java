package com.resource.backend.ai;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.resource.backend.ai.dto.AiSearchRequest;
import com.resource.backend.ai.dto.SearchIntent;
import com.resource.backend.ai.dto.SearchIntentResponse;
import com.resource.backend.dto.MaterialSearchCriteria;
import com.resource.backend.dto.PageResponse;
import com.resource.backend.dto.SpaceSearchCriteria;
import com.resource.backend.dto.SpaceSummaryResponse;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.ResourceType;
import com.resource.backend.service.MaterialService;
import com.resource.backend.service.SpaceService;

/**
 * Natural-language search, end to end.
 *
 * <p>The AI only understands the sentence; the results are produced by the same
 * repositories and specifications the normal filters use, so what a visitor sees
 * is always real, validated database data with the usual paging, sorting and
 * distance rules. This class holds no AI output that has not been through
 * {@link SearchIntentParser}, and it never writes anything to the database.</p>
 *
 * <p>A search that matches nothing is not a dead end. The criteria are relaxed
 * one at a time - a quantity nobody has, a capacity no space is listed for, a
 * budget nothing fits - and the closest listings are shown together with a note
 * saying exactly which criterion was dropped. Every step is still a database
 * query against real listings; the relaxation never invents anything and the
 * note never claims a match that was not found.</p>
 *
 * <p>Two guards keep the feature affordable and predictable: identical queries
 * are answered from {@link AiSearchIntentCache}, and callers are capped per
 * minute by {@link AiRateLimiter}.</p>
 */
@Service
public class AiSearchService {

    private static final int DEFAULT_PAGE_SIZE = 9;

    /** Words too common to search listings by when everything else has failed. */
    private static final Set<String> STOPWORDS = Set.of(
            "a", "an", "and", "any", "are", "at", "be", "by", "can", "do", "for", "from", "get",
            "give", "i", "in", "is", "it", "looking", "me", "my", "need", "near", "of", "on", "or",
            "please", "some", "that", "the", "to", "want", "with", "within", "without", "you");

    private final AiProvider aiProvider;
    private final AiProperties properties;
    private final SearchIntentParser parser;
    private final AiSearchIntentCache cache;
    private final SpaceService spaceService;
    private final MaterialService materialService;

    public AiSearchService(AiProvider aiProvider,
                           AiProperties properties,
                           SearchIntentParser parser,
                           AiSearchIntentCache cache,
                           SpaceService spaceService,
                           MaterialService materialService) {
        this.aiProvider = aiProvider;
        this.properties = properties;
        this.parser = parser;
        this.cache = cache;
        this.spaceService = spaceService;
        this.materialService = materialService;
    }

    /**
     * One search: understand, apply, relax if needed, return.
     *
     * @return the intent that was actually applied, any relaxation note, and the real page of results
     */
    public AiSearchResult search(AiSearchRequest request) {
        ResourceType marketplace = request.resourceType();
        String query = request.searchQuery().trim();

        if (query.length() > properties.searchQueryMaxLength()) {
            query = query.substring(0, properties.searchQueryMaxLength());
        }

        // Final, so the loader below can close over it: the same sentence is
        // understood once, no matter how many callers are waiting for the answer.
        String sentence = query;

        AiSearchIntentCache.CachedIntent understood = cache.getOrLoad(marketplace, sentence, () -> {
            SearchIntentParser.ParsedIntent parsed = parser.parse(sentence, marketplace);

            return new AiSearchIntentCache.CachedIntent(parsed.intent(), parsed.detected());
        });

        SearchIntent applied = applicable(understood.intent(), request.hasCoordinates());

        // The visitor's sentence is not a text filter: it is only used in the
        // stage built for it below.
        SearchIntent base = applied.withoutQuery();

        PageResponse<?> results = filter(base, request, marketplace);
        SearchIntent finalIntent = base;
        String note = null;
        String keywordUsed = null;

        // Relax one criterion at a time until something is found.
        for (SearchIntent candidate : ladder(base, marketplace)) {
            if (!isEmpty(results)) {
                break;
            }

            finalIntent = candidate;
            results = filter(candidate, request, marketplace);
            note = relaxationNote(base, candidate);
        }

        // When something had to be given up, the order means nothing to the
        // visitor any more: the space that came closest to what was asked is the
        // one worth showing first, not the newest one.
        if (note != null && !isEmpty(results) && marketplace == ResourceType.SPACE) {
            results = closestFirst(results, base);
        }

        // Still nothing: match the words themselves, longest first, within the
        // radius when the visitor asked for one and then without it.
        if (isEmpty(results)) {
            // The words come from the visitor's sentence, the filters from the
            // stage that has already given up everything it can.
            keywordUsed = keywordHit(understood.intent().query(), base, request, marketplace);

            if (keywordUsed != null) {
                finalIntent = base.textOnly().withQuery(keywordUsed);
                results = filter(finalIntent, request, marketplace);
                note = "Nothing matched every criterion, so the search was widened to your words: “"
                        + keywordUsed + "”. These are the closest listings.";
            }
        }

        // Last resort: the listing itself is the one thing that is never given
        // up, so only the kind of space or material the visitor asked for is.
        if (isEmpty(results)) {
            SearchIntent widest = marketplace == ResourceType.MATERIAL
                    ? base.textOnly().withoutCategory()
                    : base.textOnly().withoutActivity();

            PageResponse<?> widened = filter(widest, request, marketplace);

            if (!isEmpty(widened)) {
                finalIntent = widest;
                results = widened;
                keywordUsed = null;
                note = "No exact match: " + kindMissing(base, marketplace)
                        + ". These are the closest listings.";
            }
        }

        return new AiSearchResult(
                respond(finalIntent, marketplace, understood.detected(), note, keywordUsed), results);
    }

    /** How the last-resort note names what the visitor asked for and nobody listed. */
    private static String kindMissing(SearchIntent applied, ResourceType marketplace) {
        if (marketplace == ResourceType.MATERIAL && applied.category() != null) {
            return "nothing is listed under " + applied.category().getLabel() + " right now";
        }

        if (applied.activity() != null) {
            return "no space offers " + applied.activity().getLabel() + " yet";
        }

        return "nothing matched those words yet";
    }

    /**
     * The same page, ordered by how close each space came to the criteria that
     * had to be relaxed.
     *
     * <p>Only the page already being shown is reordered, so paging stays honest:
     * every page is still a different slice of the same database result. Spaces
     * missing fewer of the asked-for facilities come first, then the capacity
     * nearest to the number the visitor gave, then the nearest size. A space whose
     * capacity is unknown is not pushed to the front - it simply has no gap to
     * measure - and ties keep the order the query returned them in.</p>
     */
    private static PageResponse<?> closestFirst(PageResponse<?> page, SearchIntent asked) {
        boolean informative = asked.capacity() != null || !asked.facilities().isEmpty()
                || asked.minAreaSqft() != null || asked.maxAreaSqft() != null;

        if (!informative || page.content() == null) {
            return page;
        }

        List<SpaceSummaryResponse> spaces = page.content().stream()
                .filter(SpaceSummaryResponse.class::isInstance)
                .map(SpaceSummaryResponse.class::cast)
                .sorted(Comparator
                        .comparingInt((SpaceSummaryResponse space) -> missingFacilities(space, asked))
                        .thenComparingInt((SpaceSummaryResponse space) -> capacityGap(space, asked))
                        .thenComparingLong(space -> space.id() == null ? Long.MAX_VALUE : space.id()))
                .toList();

        return new PageResponse<>(spaces, page.page(), page.size(), page.totalElements(),
                page.totalPages(), page.first(), page.last());
    }

    /** How many of the asked-for facilities this space does not offer. */
    private static int missingFacilities(SpaceSummaryResponse space, SearchIntent asked) {
        if (asked.facilities().isEmpty()) {
            return 0;
        }

        List<String> offered = space.facilities() == null ? List.of() : space.facilities();

        return (int) asked.facilities().stream()
                .map(Facility::name)
                .filter(facility -> !offered.contains(facility))
                .count();
    }

    /** How far this space is from the number of people asked for; 0 when unknown. */
    private static int capacityGap(SpaceSummaryResponse space, SearchIntent asked) {
        if (asked.capacity() == null || space.capacity() == null) {
            return 0;
        }

        return Math.abs(asked.capacity() - space.capacity());
    }

    /** True when there is a provider to call at all; the controller reports the fallback otherwise. */
    public boolean available() {
        return aiProvider.isConfigured();
    }

    /** The intent plus the page of real listings it produced. */
    public record AiSearchResult(SearchIntentResponse intent, PageResponse<?> results) {
    }

    // ------------------------------------------------------------------ stages

    /**
     * The criteria, relaxed one at a time, least important first: a quantity
     * nobody has, then the condition, then the budget. What the listing *is* -
     * the category, or the activity for a space - is only given up much later,
     * after matching the visitor's own words has failed too, because a search
     * that returns the wrong kind of listing is no better than an empty page.
     */
    private static List<SearchIntent> ladder(SearchIntent applied, ResourceType marketplace) {
        List<SearchIntent> stages = new ArrayList<>();

        if (marketplace == ResourceType.MATERIAL) {
            addIfDifferent(stages, applied.withoutQuantityFilter());
            addIfDifferent(stages, applied.withoutQuantityFilter().withoutCondition());
            addIfDifferent(stages, applied.withoutQuantityFilter().withoutCondition().withoutPrice());
        } else {
            // A space: how many people fit first, then the facilities that were
            // asked for, then the size, and only then the budget - each stage is
            // the previous one with one more criterion given up.
            SearchIntent space = applied.withoutCapacity();
            addIfDifferent(stages, space);
            addIfDifferent(stages, space = space.withoutFacilities());
            addIfDifferent(stages, space = space.withoutArea());
            addIfDifferent(stages, space.withoutPrice());
        }

        return stages;
    }

    private static void addIfDifferent(List<SearchIntent> stages, SearchIntent candidate) {
        if (stages.isEmpty() || !stages.getLast().equals(candidate)) {
            stages.add(candidate);
        }
    }

    /**
     * The keyword stage: the first keyword that finds anything wins, within the
     * radius when the visitor asked for one and then without it, because being
     * further away is still better than showing nothing at all.
     */
    private String keywordHit(String query, SearchIntent base, AiSearchRequest request,
            ResourceType marketplace) {

        for (boolean withRadius : List.of(true, false)) {
            for (String keyword : keywords(query)) {
                SearchIntent candidate = base.textOnly().withQuery(keyword);

                if (!withRadius) {
                    candidate = candidate.withoutRadius();
                }

                if (!isEmpty(filter(candidate, request, marketplace))) {
                    return keyword;
                }
            }
        }

        return null;
    }

    /** Listing words worth matching on: length 3+, not a stopword, not a bare number. */
    static List<String> keywords(String query) {
        if (query == null) {
            return List.of();
        }

        Set<String> words = new LinkedHashSet<>();

        for (String raw : query.toLowerCase(Locale.ROOT).split("[^\\p{Alnum}]+")) {
            String word = raw.strip();

            if (word.length() >= 3 && !STOPWORDS.contains(word) && !word.matches("\\d+")) {
                words.add(word);
            }
        }

        // Longest words first: they are the most specific ones.
        List<String> sorted = new ArrayList<>(words);
        sorted.sort((left, right) -> Integer.compare(right.length(), left.length()));

        return sorted.subList(0, Math.min(3, sorted.size()));
    }

    /**
     * What the visitor is told when criteria had to be dropped. Every entry names
     * the thing that was asked for and not found, in their words rather than the
     * model's.
     */
    static String relaxationNote(SearchIntent applied, SearchIntent relaxed) {
        List<String> parts = new ArrayList<>();

        if (applied.minQuantity() != null && relaxed.minQuantity() == null) {
            parts.add("no listing has " + plain(applied.minQuantity()) + unit(applied) + " or more");
        }

        if (applied.maxQuantity() != null && relaxed.maxQuantity() == null
                && applied.minQuantity() == null) {
            parts.add("nothing has that little material listed");
        }

        if (applied.capacity() != null && relaxed.capacity() == null) {
            parts.add("no space is listed for " + applied.capacity() + " people");
        }

        if (!applied.facilities().isEmpty() && relaxed.facilities().isEmpty()) {
            parts.add("no space offers " + applied.facilities().stream()
                    .map(Facility::getLabel)
                    .collect(Collectors.joining(" and ")));
        }

        if (applied.minAreaSqft() != null && relaxed.minAreaSqft() == null) {
            parts.add("no space that large is listed");
        }

        if (applied.maxAreaSqft() != null && relaxed.maxAreaSqft() == null
                && applied.minAreaSqft() == null) {
            parts.add("no space that small is listed");
        }

        if (applied.condition() != null && relaxed.condition() == null) {
            parts.add("nothing was listed in that condition");
        }

        if (applied.category() != null && relaxed.category() == null) {
            parts.add("nothing was listed under " + applied.category().getLabel());
        }

        if (applied.activity() != null && relaxed.activity() == null) {
            parts.add("no space offers " + applied.activity().getLabel());
        }

        boolean budgetDropped = applied.maxPrice() != null && relaxed.maxPrice() == null
                && !Boolean.TRUE.equals(relaxed.freeOnly());

        if (budgetDropped) {
            parts.add(Boolean.TRUE.equals(applied.freeOnly()) || applied.maxPrice().signum() == 0
                    ? "nothing free was found"
                    : "nothing was within ₹" + plain(applied.maxPrice()));
        }

        if (parts.isEmpty()) {
            return null;
        }

        return "No exact match: " + String.join("; ", parts) + ". These are the closest listings.";
    }

    private SearchIntentResponse respond(SearchIntent intent, ResourceType marketplace,
            ResourceType detected, String note, String keyword) {
        SearchIntentResponse described = parser.describe(intent, marketplace, detected);

        if (keyword == null) {
            return new SearchIntentResponse(described.resourceType(), described.detectedResourceType(),
                    described.intent(), described.chips(), described.summary(), note);
        }

        // A keyword search has no structured criteria, and saying "nothing was
        // picked out of your words" would hide what was actually done.
        return new SearchIntentResponse(described.resourceType(), described.detectedResourceType(),
                described.intent(), List.of("“" + keyword + "”"),
                "Showing " + (marketplace == ResourceType.MATERIAL ? "materials" : "spaces")
                        + " mentioning: “" + keyword + "”",
                note);
    }

    // ---------------------------------------------------------------- filters

    private PageResponse<?> filter(SearchIntent intent, AiSearchRequest request, ResourceType marketplace) {
        return marketplace == ResourceType.MATERIAL
                ? materialService.search(materialCriteria(intent, request), null)
                : spaceService.search(spaceCriteria(intent, request), null);
    }

    private static boolean isEmpty(PageResponse<?> results) {
        return results == null || results.content() == null || results.content().isEmpty();
    }

    /**
     * Drops criteria this deployment cannot apply, so the summary line never
     * claims something the query did not do.
     */
    private static SearchIntent applicable(SearchIntent intent, boolean hasCoordinates) {
        if (intent.radiusKm() != null && !hasCoordinates) {
            intent = intent.withoutRadius();
        }

        // Quantities in different units are never comparable, so a quantity
        // filter without a unit is not applied at all.
        if (intent.minQuantity() != null && intent.quantityUnit() == null) {
            intent = intent.withoutQuantityFilter();
        }

        return intent;
    }

    private static SpaceSearchCriteria spaceCriteria(SearchIntent intent, AiSearchRequest request) {
        boolean priced = intent.maxPrice() != null;

        return new SpaceSearchCriteria(
                intent.query(),
                intent.activity(),
                priced ? intent.maxPrice() : null,
                intent.capacity(),
                intent.minAreaSqft(),
                intent.maxAreaSqft(),
                intent.facilities(),
                request.latitude(),
                request.longitude(),
                intent.radiusKm(),
                request.hasCoordinates() ? "distance" : "newest",
                request.pageIndex(),
                request.pageSize(DEFAULT_PAGE_SIZE));
    }

    private static MaterialSearchCriteria materialCriteria(SearchIntent intent, AiSearchRequest request) {
        boolean freeOnly = Boolean.TRUE.equals(intent.freeOnly())
                || (intent.maxPrice() != null && intent.maxPrice().signum() == 0);

        return new MaterialSearchCriteria(
                intent.query(),
                intent.category(),
                intent.condition(),
                intent.minQuantity(),
                intent.quantityUnit(),
                freeOnly ? null : intent.maxPrice(),
                freeOnly,
                request.latitude(),
                request.longitude(),
                intent.radiusKm(),
                request.hasCoordinates() ? "distance" : "newest",
                request.pageIndex(),
                request.pageSize(DEFAULT_PAGE_SIZE));
    }

    // ---------------------------------------------------------------- wording

    private static String plain(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static String unit(SearchIntent intent) {
        return intent.quantityUnit() == null ? "" : " " + intent.quantityUnit();
    }
}
