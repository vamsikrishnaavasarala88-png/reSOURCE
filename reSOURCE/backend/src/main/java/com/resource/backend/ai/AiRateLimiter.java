package com.resource.backend.ai;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * A small sliding-window counter that keeps AI calls affordable.
 *
 * <p>AI search is public - anyone browsing can use it - so it is capped per
 * client address, and the signed-in listing tools are capped per user. Counters
 * live in memory: they protect the API key from a runaway loop, not from a
 * distributed attack, and that is the level of protection the free features
 * need.</p>
 */
@Component
public class AiRateLimiter {

    private static final int MAX_TRACKED_KEYS = 10_000;

    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    /**
     * Records one call and says whether it is allowed.
     *
     * @param key    {@code "search:1.2.3.4"} or {@code "listing:42"}
     * @param limit  allowed calls per window
     * @param window length of the window
     * @return true when the call may proceed
     */
    public boolean allow(String key, int limit, Duration window) {
        Instant now = Instant.now();
        Instant cutoff = now.minus(window);

        if (hits.size() > MAX_TRACKED_KEYS) {
            hits.clear();
        }

        Deque<Instant> window_hits = hits.computeIfAbsent(key, ignored -> new ArrayDeque<>());

        synchronized (window_hits) {
            while (!window_hits.isEmpty() && window_hits.peekFirst().isBefore(cutoff)) {
                window_hits.pollFirst();
            }

            if (window_hits.size() >= limit) {
                return false;
            }

            window_hits.addLast(now);

            return true;
        }
    }
}
