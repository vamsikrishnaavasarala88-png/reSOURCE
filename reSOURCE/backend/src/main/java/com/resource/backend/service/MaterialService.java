package com.resource.backend.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.resource.backend.dto.CreateMaterialRequest;
import com.resource.backend.dto.MaterialDetailResponse;
import com.resource.backend.dto.MaterialSearchCriteria;
import com.resource.backend.dto.MaterialSummaryResponse;
import com.resource.backend.dto.PageResponse;
import com.resource.backend.dto.UpdateMaterialRequest;
import com.resource.backend.entity.Material;
import com.resource.backend.entity.MaterialPhoto;
import com.resource.backend.entity.MaterialStatus;
import com.resource.backend.entity.User;
import com.resource.backend.exception.BadRequestException;
import com.resource.backend.exception.ForbiddenOperationException;
import com.resource.backend.exception.ResourceNotFoundException;
import com.resource.backend.repository.MaterialRepository;
import com.resource.backend.repository.MaterialSpecifications;
import com.resource.backend.repository.UserRepository;
import com.resource.backend.service.storage.PhotoStorageService;
import com.resource.backend.service.storage.StoredPhoto;
import com.resource.backend.util.GeoUtils;

/**
 * Surplus material listings: create, edit, soft delete, photos and search.
 *
 * <p>Ownership is always decided here from the authenticated user id, never from
 * the request body. The marketplace only ever shows {@code ACTIVE} listings;
 * deleted ones stay in the database for the requests that reference them.</p>
 *
 * <p>The material marketplace knows nothing about spaces, activities or
 * bookings: the two marketplaces are independent on purpose.</p>
 */
@Service
public class MaterialService {

    private static final int MAX_PAGE_SIZE = 60;
    private static final int DEFAULT_PAGE_SIZE = 9;
    private static final int MAX_DISTANCE_CANDIDATES = 300;

    private final MaterialRepository materialRepository;
    private final UserRepository userRepository;
    private final PhotoStorageService photoStorageService;

    public MaterialService(
            MaterialRepository materialRepository,
            UserRepository userRepository,
            PhotoStorageService photoStorageService) {
        this.materialRepository = materialRepository;
        this.userRepository = userRepository;
        this.photoStorageService = photoStorageService;
    }

    // ------------------------------------------------------------------ writes

    @Transactional
    public MaterialDetailResponse create(Long ownerId, CreateMaterialRequest request) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User " + ownerId + " was not found."));

        Material material = new Material(owner, request.title().trim(), request.category(),
                request.description().trim(), request.quantity(), request.unit().trim(),
                request.condition(), request.address().trim());

        material.setPrice(request.price(), Boolean.TRUE.equals(request.isFree()));
        material.setLatitude(request.latitude());
        material.setLongitude(request.longitude());
        material.setOwnerNote(blankToNull(request.ownerNote()));
        material.setStatus(MaterialStatus.ACTIVE);

        return MaterialDetailResponse.from(materialRepository.save(material), ownerId, null);
    }

    @Transactional
    public MaterialDetailResponse update(Long materialId, Long ownerId, UpdateMaterialRequest request) {
        Material material = requireOwnedMaterial(materialId, ownerId, "modify");

        material.setTitle(request.title().trim());
        material.setCategory(request.category());
        material.setDescription(request.description().trim());
        material.setQuantity(request.quantity());
        material.setUnit(request.unit().trim());
        material.setCondition(request.condition());
        material.setPrice(request.price(), Boolean.TRUE.equals(request.isFree()));
        material.setAddress(request.address().trim());
        material.setLatitude(request.latitude());
        material.setLongitude(request.longitude());
        material.setOwnerNote(blankToNull(request.ownerNote()));

        if (request.status() != null) {
            if (request.status() == MaterialStatus.DELETED) {
                throw new BadRequestException(
                        "Use DELETE /api/materials/" + materialId + " to delete a listing.");
            }
            material.setStatus(request.status());
        }

        return MaterialDetailResponse.from(materialRepository.save(material), ownerId, null);
    }

    /** Soft delete: the listing leaves discovery but is not removed from history. */
    @Transactional
    public void delete(Long materialId, Long ownerId) {
        Material material = requireOwnedMaterial(materialId, ownerId, "delete");
        material.markDeleted();
        materialRepository.save(material);
    }

    // ------------------------------------------------------------------ photos

    @Transactional
    public MaterialDetailResponse addPhotos(Long materialId, Long ownerId, List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            throw new BadRequestException("Select at least one image to upload.");
        }

        Material material = requireOwnedMaterial(materialId, ownerId, "modify");
        List<StoredPhoto> stored = new ArrayList<>();

        try {
            for (MultipartFile file : files) {
                StoredPhoto photo = photoStorageService.store(file);
                stored.add(photo);
                material.addPhoto(new MaterialPhoto(photo.url(), photo.key(), material.nextPhotoOrder()));
            }
        } catch (RuntimeException exception) {
            // Do not leave orphaned files behind when one upload in the batch fails.
            stored.forEach(photo -> photoStorageService.delete(photo.key()));
            throw exception;
        }

        return MaterialDetailResponse.from(materialRepository.save(material), ownerId, null);
    }

    @Transactional
    public void deletePhoto(Long materialId, Long photoId, Long ownerId) {
        Material material = requireOwnedMaterial(materialId, ownerId, "modify");

        MaterialPhoto photo = material.getPhotos().stream()
                .filter(candidate -> photoId.equals(candidate.getId()))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Photo " + photoId + " was not found."));

        material.removePhoto(photo);
        materialRepository.save(material);
        photoStorageService.delete(photo.getStorageKey());
    }

    /** Sets the gallery order to the given photo ids. */
    @Transactional
    public MaterialDetailResponse reorderPhotos(Long materialId, Long ownerId, List<Long> photoIds) {
        Material material = requireOwnedMaterial(materialId, ownerId, "modify");

        Map<Long, MaterialPhoto> byId = material.getPhotos().stream()
                .collect(Collectors.toMap(MaterialPhoto::getId, Function.identity()));

        if (photoIds == null || photoIds.size() != byId.size() || !byId.keySet().containsAll(photoIds)) {
            throw new BadRequestException("Send the ids of all photos of this material, in the new order.");
        }

        for (int index = 0; index < photoIds.size(); index++) {
            byId.get(photoIds.get(index)).setDisplayOrder(index);
        }

        return MaterialDetailResponse.from(materialRepository.save(material), ownerId, null);
    }

    // ------------------------------------------------------------------- reads

    /** Public discovery: only ACTIVE listings, with filters and pagination. */
    @Transactional(readOnly = true)
    public PageResponse<MaterialSummaryResponse> search(MaterialSearchCriteria criteria, Long viewerId) {
        requireComparableQuantity(criteria);

        Specification<Material> specification = buildSpecification(criteria);

        if (hasCoordinates(criteria)) {
            return searchWithDistance(specification, criteria);
        }

        Pageable pageable = PageRequest.of(
                Math.max(criteria.page(), 0),
                normaliseSize(criteria.size()),
                resolveSort(criteria.sort()));

        return PageResponse.from(materialRepository.findAll(specification, pageable),
                material -> MaterialSummaryResponse.from(material, null));
    }

    /** One listing. Only its owner may open a paused or deleted one. */
    @Transactional(readOnly = true)
    public MaterialDetailResponse getPublic(
            Long materialId, Long viewerId, BigDecimal fromLatitude, BigDecimal fromLongitude) {

        // Publicly, only an ACTIVE listing exists: a paused one is hidden from
        // everyone but its owner, and a deleted one is gone for good.
        Material material = materialRepository.findById(materialId)
                .filter(candidate -> candidate.isActive() || candidate.isOwnedBy(viewerId))
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Material " + materialId + " was not found."));

        Double distanceKm = GeoUtils.haversineKm(fromLatitude, fromLongitude,
                material.getLatitude(), material.getLongitude());

        return MaterialDetailResponse.from(material, viewerId, distanceKm);
    }

    /** Everything the authenticated user listed, including paused listings. */
    @Transactional(readOnly = true)
    public List<MaterialSummaryResponse> listMine(Long ownerId) {
        Specification<Material> specification = MaterialSpecifications.ownedBy(ownerId)
                .and((root, query, cb) -> cb.notEqual(root.get("status"), MaterialStatus.DELETED));

        return materialRepository.findAll(specification, Sort.by(Sort.Direction.DESC, "createdAt"))
                .stream()
                .map(material -> MaterialSummaryResponse.from(material, null))
                .toList();
    }

    // --------------------------------------------------------------- internals

    /** Loads a listing for writing, refusing anyone who is not its owner. */
    private Material requireOwnedMaterial(Long materialId, Long ownerId, String action) {
        Material material = materialRepository.findById(materialId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Material " + materialId + " was not found."));

        if (!material.isOwnedBy(ownerId)) {
            throw new ForbiddenOperationException("You are not authorized to " + action + " this material.");
        }

        return material;
    }

    /**
     * A quantity filter without a unit would compare unlike things (200 kg against
     * 200 pieces), so it is refused instead of silently applied.
     */
    private void requireComparableQuantity(MaterialSearchCriteria criteria) {
        if (criteria.minQuantity() == null) {
            return;
        }

        if (criteria.unit() == null || criteria.unit().isBlank()) {
            throw new BadRequestException(
                    "Choose a unit as well: quantities in different units cannot be compared.");
        }

        if (criteria.minQuantity().signum() < 0) {
            throw new BadRequestException("The minimum quantity cannot be negative.");
        }
    }

    private Specification<Material> buildSpecification(MaterialSearchCriteria criteria) {
        Specification<Material> specification = MaterialSpecifications.hasStatus(MaterialStatus.ACTIVE);

        if (criteria.q() != null && !criteria.q().isBlank()) {
            specification = specification.and(MaterialSpecifications.matchesText(criteria.q()));
        }

        if (criteria.category() != null) {
            specification = specification.and(MaterialSpecifications.hasCategory(criteria.category()));
        }

        if (criteria.condition() != null) {
            specification = specification.and(MaterialSpecifications.hasCondition(criteria.condition()));
        }

        if (criteria.minQuantity() != null) {
            specification = specification.and(
                    MaterialSpecifications.hasMinimumQuantity(criteria.minQuantity(), criteria.unit()));
        }

        if (criteria.freeOnly()) {
            specification = specification.and(MaterialSpecifications.isFreeOnly());
        } else if (criteria.maxPrice() != null) {
            specification = specification.and(MaterialSpecifications.costsAtMost(criteria.maxPrice()));
        }

        if (hasCoordinates(criteria) && criteria.radiusKm() != null && criteria.radiusKm() > 0) {
            double latitude = criteria.latitude().doubleValue();
            double longitude = criteria.longitude().doubleValue();
            double radius = criteria.radiusKm();

            // The box only narrows the rows the database has to hand over; the
            // Haversine below decides who is really inside the radius.
            double[] box = GeoUtils.boundingBox(latitude, longitude, radius);

            specification = specification.and(MaterialSpecifications.withinBounds(
                    BigDecimal.valueOf(box[0]), BigDecimal.valueOf(box[1]),
                    BigDecimal.valueOf(box[2]), BigDecimal.valueOf(box[3])));
        }

        return specification;
    }

    private boolean hasCoordinates(MaterialSearchCriteria criteria) {
        return criteria.latitude() != null && criteria.longitude() != null;
    }

    /**
     * Distance based searches filter by the exact Haversine distance and are paged
     * in memory, because the distance is not a stored column.
     */
    private PageResponse<MaterialSummaryResponse> searchWithDistance(
            Specification<Material> specification, MaterialSearchCriteria criteria) {

        List<MaterialSummaryResponse> matches = materialRepository.findAll(specification,
                        Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .limit(MAX_DISTANCE_CANDIDATES)
                .map(material -> MaterialSummaryResponse.from(material, GeoUtils.haversineKm(
                        criteria.latitude(), criteria.longitude(),
                        material.getLatitude(), material.getLongitude())))
                .filter(summary -> criteria.radiusKm() == null
                        || summary.distanceKm() == null
                        || summary.distanceKm() <= criteria.radiusKm())
                .sorted(comparatorFor(criteria.sort()))
                .toList();

        int size = normaliseSize(criteria.size());
        int page = Math.max(criteria.page(), 0);
        int fromIndex = Math.min(page * size, matches.size());
        int toIndex = Math.min(fromIndex + size, matches.size());
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) matches.size() / size);

        return new PageResponse<>(
                matches.subList(fromIndex, toIndex),
                page,
                size,
                matches.size(),
                totalPages,
                page == 0,
                page >= totalPages - 1);
    }

    private Comparator<MaterialSummaryResponse> comparatorFor(String sort) {
        return switch (normaliseSort(sort)) {
            case "priceAsc" -> Comparator.comparing(
                    MaterialSummaryResponse::price,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            case "priceDesc" -> Comparator.comparing(
                    MaterialSummaryResponse::price,
                    Comparator.nullsLast(Comparator.reverseOrder()));
            default -> Comparator.comparing(
                    MaterialSummaryResponse::createdAt,
                    Comparator.nullsLast(Comparator.reverseOrder()));
        };
    }

    private Sort resolveSort(String sort) {
        return switch (normaliseSort(sort)) {
            // A free listing costs 0, so it sorts first on a price sort - which is
            // what "lowest price first" means to a visitor.
            case "priceAsc" -> Sort.by(Sort.Direction.ASC, "price").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            case "priceDesc" -> Sort.by(Sort.Direction.DESC, "price").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };
    }

    private String normaliseSort(String sort) {
        if (sort == null) {
            return "newest";
        }

        String cleaned = sort.trim().toLowerCase();

        return switch (cleaned) {
            case "priceasc", "price_asc", "price" -> "priceAsc";
            case "pricedesc", "price_desc" -> "priceDesc";
            default -> "newest";
        };
    }

    private int normaliseSize(Integer size) {
        if (size == null || size <= 0) {
            return DEFAULT_PAGE_SIZE;
        }

        return Math.min(size, MAX_PAGE_SIZE);
    }

    private String blankToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

}
