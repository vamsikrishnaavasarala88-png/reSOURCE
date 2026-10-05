package com.resource.backend.ai;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import com.resource.backend.ai.dto.SearchIntent;
import com.resource.backend.entity.ResourceType;

/**
 * Remembers the intent of a query for a while.
 *
 * <p>Identical sentences produce the identical filters, so a repeated search -
 * a shared link, a page refresh, someone retyping the same words - costs one
 * provider call instead of many. Only the validated intent is stored, keyed by
 * the normalised query text; nothing about the caller is kept. The provider's
 * raw answer is deliberately not cached, because the validation is what makes
 * it safe and re-running it is free.</p>
 */
@Component
public class AiSearchIntentCache {

    private static final int MAX_QUERY_LENGTH = 300;

    private final AiProperties properties;
    private final Map<String, Entry> entries;

    /** One lock per sentence currently being understood; empty the rest of the time. */
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public AiSearchIntentCache(AiProperties properties) {
        this.properties = properties;
        this.entries = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
                return size() > properties.cacheMaxEntries();
            }
        };
    }

    /**
     * What is remembered about one query.
     *
     * @param intent   the validated filters
     * @param detected the marketplace the model guessed
     */
    public record CachedIntent(SearchIntent intent, ResourceType detected) {
    }

    /** The cached intent for this query, or {@code null} when there is none. */
    public CachedIntent get(ResourceType requested, String query) {
        if (properties.cacheTtlSeconds() == 0) {
            return null;
        }

        String key = key(requested, query);

        synchronized (entries) {
            Entry entry = entries.get(key);

            if (entry == null) {
                return null;
            }

            if (entry.storedAt().plusSeconds(properties.cacheTtlSeconds()).isBefore(Instant.now())) {
                entries.remove(key);
                return null;
            }

            return entry.intent();
        }
    }

    /**
     * The cached intent for this query, loading it once if it is not there yet.
     *
     * <p>Two people typing the same sentence at the same moment, a double click,
     * a page that fires twice: without this each one of those is a separate
     * provider call. The first caller runs the loader while the others wait for
     * the same key, so the sentence is understood exactly once and everybody is
     * answered from the same result. Nothing is held while waiting except the
     * loader itself, and a failing loader holds nothing at all.</p>
     */
    public CachedIntent getOrLoad(ResourceType requested, String query, Supplier<CachedIntent> loader) {
        CachedIntent cached = get(requested, query);

        if (cached != null) {
            return cached;
        }

        String key = key(requested, query);

        // The lock is per sentence, and is dropped as soon as the first caller is
        // done, so unrelated searches never wait for each other.
        Object lock = locks.computeIfAbsent(key, ignored -> new Object());

        try {
            synchronized (lock) {
                CachedIntent loaded = get(requested, query);

                if (loaded != null) {
                    return loaded;
                }

                CachedIntent fresh = loader.get();
                put(requested, query, fresh);

                return fresh;
            }
        } finally {
            locks.remove(key, lock);
        }
    }

    public void put(ResourceType requested, String query, CachedIntent intent) {
        if (properties.cacheTtlSeconds() == 0) {
            return;
        }

        synchronized (entries) {
            entries.put(key(requested, query), new Entry(intent, Instant.now()));
        }
    }

    /**
     * Trims, collapses whitespace and lowercases, so "Free  hall" and "free hall"
     * match. The marketplace is part of the key, because the same words are
     * filtered differently on the two pages.
     */
    private static String key(ResourceType requested, String query) {
        String normalised = query == null ? "" : query.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);

        if (normalised.length() > MAX_QUERY_LENGTH) {
            normalised = normalised.substring(0, MAX_QUERY_LENGTH);
        }

        return (requested == null ? "" : requested.name()) + "|" + normalised;
    }

    private record Entry(CachedIntent intent, Instant storedAt) {
    }
}
