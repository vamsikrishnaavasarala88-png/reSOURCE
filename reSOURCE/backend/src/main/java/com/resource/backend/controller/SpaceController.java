package com.resource.backend.controller;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.resource.backend.dto.CreateSpaceRequest;
import com.resource.backend.dto.PageResponse;
import com.resource.backend.dto.SpaceDetailResponse;
import com.resource.backend.dto.SpacePricingResponse;
import com.resource.backend.dto.SpaceSearchCriteria;
import com.resource.backend.dto.SpaceSummaryResponse;
import com.resource.backend.dto.UpdateSpaceRequest;
import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.service.SpaceService;
import com.resource.backend.util.GeoQuery;

import jakarta.validation.Valid;

/**
 * Space Marketplace endpoints.
 *
 * <p>Reading active spaces is public; creating, editing, deleting and photo
 * management require a bearer token and are restricted to the owner.</p>
 */
@RestController
@RequestMapping("/api/spaces")
public class SpaceController {

    private final SpaceService spaceService;

    public SpaceController(SpaceService spaceService) {
        this.spaceService = spaceService;
    }

    /** Active spaces, newest first, paginated. */
    @GetMapping
    public PageResponse<SpaceSummaryResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ActivityType activity,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Integer minCapacity,
            @RequestParam(required = false) BigDecimal minArea,
            @RequestParam(required = false) BigDecimal maxArea,
            @RequestParam(required = false) List<Facility> facilities,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "9") int size,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.search(criteria(q, activity, maxPrice, minCapacity, minArea, maxArea,
                facilities, latitude, longitude, radiusKm, sort, page, size), viewerId(principal));
    }

    /** Same filters as the listing endpoint; kept as its own route by design. */
    @GetMapping("/search")
    public PageResponse<SpaceSummaryResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ActivityType activity,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Integer minCapacity,
            @RequestParam(required = false) BigDecimal minArea,
            @RequestParam(required = false) BigDecimal maxArea,
            @RequestParam(required = false) List<Facility> facilities,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "9") int size,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.search(criteria(q, activity, maxPrice, minCapacity, minArea, maxArea,
                facilities, latitude, longitude, radiusKm, sort, page, size), viewerId(principal));
    }

    /** The authenticated user's own listings, including paused ones. */
    @GetMapping("/mine")
    public List<SpaceSummaryResponse> mine(@AuthenticationPrincipal ResourceUserDetails principal) {
        return spaceService.listMine(principal.getId());
    }

    @GetMapping("/{id}")
    public SpaceDetailResponse getById(
            @PathVariable Long id,
            @RequestParam(required = false) BigDecimal fromLatitude,
            @RequestParam(required = false) BigDecimal fromLongitude,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.getPublic(id, viewerId(principal), fromLatitude, fromLongitude);
    }

    @GetMapping("/{id}/pricing")
    public List<SpacePricingResponse> pricing(@PathVariable Long id) {
        return spaceService.getPricing(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SpaceDetailResponse create(
            @Valid @RequestBody CreateSpaceRequest request,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.create(principal.getId(), request);
    }

    @PutMapping("/{id}")
    public SpaceDetailResponse update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateSpaceRequest request,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.update(id, principal.getId(), request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        spaceService.delete(id, principal.getId());
    }

    /** Uploads one or more photos to an existing listing (owner only). */
    @PostMapping(value = "/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public SpaceDetailResponse uploadPhotos(
            @PathVariable Long id,
            @RequestParam("files") List<MultipartFile> files,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.addPhotos(id, principal.getId(), files);
    }

    @DeleteMapping("/{id}/photos/{photoId}")
    public SpaceDetailResponse deletePhoto(
            @PathVariable Long id,
            @PathVariable Long photoId,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        spaceService.deletePhoto(id, photoId, principal.getId());
        return spaceService.getPublic(id, principal.getId(), null, null);
    }

    @PutMapping("/{id}/photos/order")
    public SpaceDetailResponse reorderPhotos(
            @PathVariable Long id,
            @RequestBody List<Long> photoIds,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return spaceService.reorderPhotos(id, principal.getId(), photoIds);
    }

    // --------------------------------------------------------------- internals

    private Long viewerId(ResourceUserDetails principal) {
        return principal == null ? null : principal.getId();
    }

    private SpaceSearchCriteria criteria(
            String q, ActivityType activity, BigDecimal maxPrice, Integer minCapacity,
            BigDecimal minArea, BigDecimal maxArea, List<Facility> facilities,
            BigDecimal latitude, BigDecimal longitude, Double radiusKm, String sort,
            int page, int size) {

        // Coordinates and a radius come from the browser, so only the part the
        // backend can actually enforce is kept; the rest is dropped, never
        // guessed. Distance is calculated from the stored coordinates later.
        GeoQuery location = GeoQuery.of(latitude, longitude, radiusKm);

        return new SpaceSearchCriteria(q, activity, maxPrice, minCapacity, minArea, maxArea,
                facilities == null ? List.of() : List.copyOf(facilities),
                location.latitude(), location.longitude(), location.radiusKm(), sort, page, size);
    }
}
