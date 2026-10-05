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

import jakarta.validation.Valid;

import com.resource.backend.dto.CreateMaterialRequest;
import com.resource.backend.dto.MaterialDetailResponse;
import com.resource.backend.dto.MaterialSearchCriteria;
import com.resource.backend.dto.MaterialSummaryResponse;
import com.resource.backend.dto.PageResponse;
import com.resource.backend.dto.UpdateMaterialRequest;
import com.resource.backend.entity.MaterialCategory;
import com.resource.backend.entity.MaterialCondition;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.service.MaterialService;
import com.resource.backend.util.GeoQuery;

/**
 * Surplus material marketplace.
 *
 * <p>Browsing is public, like the space marketplace: the access token is used
 * only to mark the caller's own listings and to allow writing. The owner of a
 * listing always comes from the token, never from the body.</p>
 */
@RestController
@RequestMapping("/api/materials")
public class MaterialController {

    private final MaterialService materialService;

    public MaterialController(MaterialService materialService) {
        this.materialService = materialService;
    }

    @GetMapping
    public PageResponse<MaterialSummaryResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) MaterialCategory category,
            @RequestParam(required = false) MaterialCondition condition,
            @RequestParam(required = false) BigDecimal minQuantity,
            @RequestParam(required = false) String unit,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "false") boolean freeOnly,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "9") int size,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.search(criteria(q, category, condition, minQuantity, unit, maxPrice,
                freeOnly, latitude, longitude, radiusKm, sort, page, size), viewerId(principal));
    }

    /** Same filters as the listing endpoint; kept as its own route by design. */
    @GetMapping("/search")
    public PageResponse<MaterialSummaryResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) MaterialCategory category,
            @RequestParam(required = false) MaterialCondition condition,
            @RequestParam(required = false) BigDecimal minQuantity,
            @RequestParam(required = false) String unit,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "false") boolean freeOnly,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "9") int size,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.search(criteria(q, category, condition, minQuantity, unit, maxPrice,
                freeOnly, latitude, longitude, radiusKm, sort, page, size), viewerId(principal));
    }

    /** The authenticated user's own listings, including paused ones. */
    @GetMapping("/mine")
    public List<MaterialSummaryResponse> mine(@AuthenticationPrincipal ResourceUserDetails principal) {
        return materialService.listMine(principal.getId());
    }

    @GetMapping("/{id}")
    public MaterialDetailResponse getById(
            @PathVariable Long id,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.getPublic(id, viewerId(principal), latitude, longitude);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MaterialDetailResponse create(
            @Valid @RequestBody CreateMaterialRequest request,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.create(principal.getId(), request);
    }

    @PutMapping("/{id}")
    public MaterialDetailResponse update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateMaterialRequest request,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.update(id, principal.getId(), request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable Long id,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        materialService.delete(id, principal.getId());
    }

    /** Uploads one or more photos to an existing listing (owner only). */
    @PostMapping(value = "/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public MaterialDetailResponse uploadPhotos(
            @PathVariable Long id,
            @RequestParam("files") List<MultipartFile> files,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.addPhotos(id, principal.getId(), files);
    }

    @DeleteMapping("/{id}/photos/{photoId}")
    public MaterialDetailResponse deletePhoto(
            @PathVariable Long id,
            @PathVariable Long photoId,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        materialService.deletePhoto(id, photoId, principal.getId());
        return materialService.getPublic(id, principal.getId(), null, null);
    }

    @PutMapping("/{id}/photos/order")
    public MaterialDetailResponse reorderPhotos(
            @PathVariable Long id,
            @RequestBody List<Long> photoIds,
            @AuthenticationPrincipal ResourceUserDetails principal) {

        return materialService.reorderPhotos(id, principal.getId(), photoIds);
    }

    // --------------------------------------------------------------- internals

    private Long viewerId(ResourceUserDetails principal) {
        return principal == null ? null : principal.getId();
    }

    private MaterialSearchCriteria criteria(
            String q, MaterialCategory category, MaterialCondition condition,
            BigDecimal minQuantity, String unit, BigDecimal maxPrice, boolean freeOnly,
            BigDecimal latitude, BigDecimal longitude, Double radiusKm, String sort,
            int page, int size) {

        // Same rule as the space marketplace: an unusable coordinate or radius is
        // dropped, so a bad query returns the ordinary results instead of an error
        // or a silently wrong distance filter.
        GeoQuery location = GeoQuery.of(latitude, longitude, radiusKm);

        return new MaterialSearchCriteria(q, category, condition, minQuantity, unit, maxPrice,
                freeOnly, location.latitude(), location.longitude(), location.radiusKm(),
                sort, page, size);
    }
}
