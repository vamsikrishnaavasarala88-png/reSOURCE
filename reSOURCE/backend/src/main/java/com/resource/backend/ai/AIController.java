package com.resource.backend.ai;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.resource.backend.ai.dto.AiDescriptionRequest;
import com.resource.backend.ai.dto.AiFailureResponse;
import com.resource.backend.ai.dto.AiSearchRequest;
import com.resource.backend.ai.dto.AiTextRequest;
import com.resource.backend.ai.dto.DescriptionResponse;
import com.resource.backend.ai.dto.ListingExtractionResponse;
import com.resource.backend.ai.dto.MaterialRecognitionResponse;
import com.resource.backend.exception.BadRequestException;
import com.resource.backend.security.ResourceUserDetails;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * The four AI endpoints.
 *
 * <p>Controllers hold no AI logic: they check the caller, enforce the per-caller
 * caps, hand the request to a service and shape the answer. No provider ever
 * sees a password, a token or a contact detail, and nothing an AI answers is
 * written to the database by this layer.</p>
 *
 * <p>Failures are answered the same way everywhere: a small body with a message
 * a person can read and {@code fallbackAvailable: true}, because every AI
 * feature has a manual path beside it. AI search still answers {@code 200} when
 * it fails, so a page keeps its normal results instead of showing an error.</p>
 */
@RestController
@RequestMapping("/api/ai")
public class AIController {

    private static final Logger log = LoggerFactory.getLogger(AIController.class);

    static final String SEARCH_UNAVAILABLE = "AI search is temporarily unavailable. You can use filters instead.";
    static final String SEARCH_LIMIT_REACHED =
            "You have reached the AI search limit for now. Please use the filters, or try again in a minute.";
    static final String RECOGNITION_UNAVAILABLE =
            "AI recognition is temporarily unavailable. Please select the category manually.";
    static final String EXTRACTION_UNAVAILABLE =
            "AI extraction is temporarily unavailable. Please enter the details manually.";
    static final String DESCRIPTION_UNAVAILABLE =
            "AI description is temporarily unavailable. Please write the description manually.";

    private static final Duration CALL_WINDOW = Duration.ofMinutes(1);

    private final AiSearchService aiSearchService;
    private final AiRateLimiter rateLimiter;
    private final AiProperties properties;
    private final MaterialRecognitionService recognitionService;
    private final AiImageValidator imageValidator;
    private final ListingExtractionService extractionService;
    private final DescriptionService descriptionService;

    public AIController(AiSearchService aiSearchService,
                        AiRateLimiter rateLimiter,
                        AiProperties properties,
                        MaterialRecognitionService recognitionService,
                        AiImageValidator imageValidator,
                        ListingExtractionService extractionService,
                        DescriptionService descriptionService) {
        this.aiSearchService = aiSearchService;
        this.rateLimiter = rateLimiter;
        this.properties = properties;
        this.recognitionService = recognitionService;
        this.imageValidator = imageValidator;
        this.extractionService = extractionService;
        this.descriptionService = descriptionService;
    }

    /**
     * Natural-language search. Public, like browsing, so it is capped per client
     * address and answered from cache for repeated queries.
     *
     * <p>The AI returns criteria only - the listings themselves come from the
     * same database query the normal filters run.</p>
     */
    @PostMapping("/search-intent")
    public ResponseEntity<?> searchIntent(
            @Valid @RequestBody AiSearchRequest body,
            HttpServletRequest request) {

        if (!aiSearchService.available()) {
            return ResponseEntity.ok(AiFailureResponse.unavailable(SEARCH_UNAVAILABLE));
        }

        if (!rateLimiter.allow("search:" + clientAddress(request),
                properties.searchRequestsPerMinute(), CALL_WINDOW)) {
            log.info("AI search rate limit reached for one client");

            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(AiFailureResponse.unavailable(SEARCH_LIMIT_REACHED));
        }

        try {
            AiSearchService.AiSearchResult result = aiSearchService.search(body);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("resourceType", result.intent().resourceType());
            response.put("detectedResourceType", result.intent().detectedResourceType());
            response.put("intent", result.intent().intent());
            response.put("chips", result.intent().chips());
            response.put("summary", result.intent().summary());
            response.put("note", result.intent().note());
            response.put("results", result.results());

            return ResponseEntity.ok(response);
        } catch (AiUnavailableException exception) {
            log.warn("AI search failed (category={})", exception.getCategory());

            return ResponseEntity.ok(AiFailureResponse.unavailable(SEARCH_UNAVAILABLE));
        }
    }

    /**
     * Identifies material from one photo. Signed in, because it spends the key.
     *
     * <p>The answer never contains a quantity, and the owner still chooses the
     * category and types the amount.</p>
     */
    @PostMapping("/material-recognition")
    public ResponseEntity<?> recognizeMaterial(
            @RequestParam("image") MultipartFile image,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        if (!listingCallsAllowed(principal)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(AiFailureResponse.unavailable(RECOGNITION_UNAVAILABLE));
        }

        try {
            AiImageValidator.PreparedImage prepared = imageValidator.prepare(bytes(image));

            return ResponseEntity.ok(recognitionService.recognize(prepared.bytes(), prepared.mimeType()));
        } catch (AiUnavailableException exception) {
            log.warn("AI material recognition failed (category={})", exception.getCategory());

            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(AiFailureResponse.unavailable(RECOGNITION_UNAVAILABLE));
        }
    }

    /** Reads a listing written in words. Signed in; the owner reviews every field. */
    @PostMapping("/listing-extraction")
    public ResponseEntity<?> extractListing(
            @Valid @RequestBody AiTextRequest body,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        if (!listingCallsAllowed(principal)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(AiFailureResponse.unavailable(EXTRACTION_UNAVAILABLE));
        }

        String text = body.text().trim();

        if (text.length() > properties.extractionTextMaxLength()) {
            throw new BadRequestException("Please keep the description under "
                    + properties.extractionTextMaxLength() + " characters.");
        }

        try {
            ListingExtractionResponse extracted = extractionService.extract(text);

            return ResponseEntity.ok(extracted);
        } catch (AiUnavailableException exception) {
            log.warn("AI listing extraction failed (category={})", exception.getCategory());

            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(AiFailureResponse.unavailable(EXTRACTION_UNAVAILABLE));
        }
    }

    /** Writes a description from confirmed facts only. Signed in; the owner edits it. */
    @PostMapping("/generate-description")
    public ResponseEntity<?> generateDescription(
            @Valid @RequestBody AiDescriptionRequest body,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        if (!listingCallsAllowed(principal)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(AiFailureResponse.unavailable(DESCRIPTION_UNAVAILABLE));
        }

        try {
            String description = descriptionService.generate(
                    body.title(),
                    body.category(),
                    body.condition(),
                    body.quantity(),
                    body.quantityUnit(),
                    body.price(),
                    Boolean.TRUE.equals(body.isFree()),
                    body.locationText(),
                    body.ownerNote());

            return ResponseEntity.ok(new DescriptionResponse(description));
        } catch (AiUnavailableException exception) {
            log.warn("AI description failed (category={})", exception.getCategory());

            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(AiFailureResponse.unavailable(DESCRIPTION_UNAVAILABLE));
        }
    }

    // --------------------------------------------------------------- internals

    private static byte[] bytes(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new BadRequestException("Choose an image to analyze.");
        }

        try {
            return image.getBytes();
        } catch (IOException exception) {
            throw new BadRequestException("That image could not be read. Please try another one.");
        }
    }

    /** One shared cap for the signed-in AI tools; the key is the user, not the address. */
    private boolean listingCallsAllowed(ResourceUserDetails principal) {
        String key = principal == null ? "listing:anonymous" : "listing:" + principal.getId();

        return rateLimiter.allow(key, properties.listingRequestsPerMinute(), CALL_WINDOW);
    }

    /**
     * Best effort client identification for the public search cap. Behind a
     * proxy this is the proxy address, which is the level of protection
     * intended: it stops a runaway loop, not a determined attacker.
     */
    private static String clientAddress(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");

        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }

        return request.getRemoteAddr();
    }
}
