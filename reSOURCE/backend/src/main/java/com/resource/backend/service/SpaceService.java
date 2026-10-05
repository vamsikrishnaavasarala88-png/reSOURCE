package com.resource.backend.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.resource.backend.dto.CreateSpaceRequest;
import com.resource.backend.dto.PageResponse;
import com.resource.backend.dto.SpaceDetailResponse;
import com.resource.backend.dto.SpacePricingRequest;
import com.resource.backend.dto.SpacePricingResponse;
import com.resource.backend.dto.SpaceSearchCriteria;
import com.resource.backend.dto.SpaceSummaryResponse;
import com.resource.backend.dto.UpdateSpaceRequest;
import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Facility;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePhoto;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;
import com.resource.backend.entity.User;
import com.resource.backend.exception.BadRequestException;
import com.resource.backend.exception.ForbiddenOperationException;
import com.resource.backend.exception.ResourceNotFoundException;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.SpaceSpecifications;
import com.resource.backend.repository.UserRepository;
import com.resource.backend.service.storage.PhotoStorageService;
import com.resource.backend.service.storage.StoredPhoto;
import com.resource.backend.util.GeoUtils;

/**
 * The Space Marketplace: listing, discovery, editing and soft deletion.
 *
 * <p>Every mutation resolves the owner from the authenticated user id and
 * compares it with the listing's owner; an owner id sent by a client is never
 * used.</p>
 */
@Service
public class SpaceService {

    /** Guard for distance sorted searches, which are paged in memory. */
    private static final int MAX_DISTANCE_CANDIDATES = 5000;

    private static final int DEFAULT_PAGE_SIZE = 9;
    private static final int MAX_PAGE_SIZE = 60;

    private final SpaceRepository spaceRepository;
    private final UserRepository userRepository;
    private final PhotoStorageService photoStorageService;

    public SpaceService(
            SpaceRepository spaceRepository,
            UserRepository userRepository,
            PhotoStorageService photoStorageService) {
        this.spaceRepository = spaceRepository;
        this.userRepository = userRepository;
        this.photoStorageService = photoStorageService;
    }

    // ------------------------------------------------------------------ writes

    @Transactional
    public SpaceDetailResponse create(Long ownerId, CreateSpaceRequest request) {
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User " + ownerId + " was not found."));

        Space space = new Space(owner, request.title().trim(), request.description().trim(),
                request.address().trim());

        applyDetails(space, request.title(), request.description(), request.address(),
                request.latitude(), request.longitude(), request.area(), request.areaUnit(),
                request.capacity(), request.availability(), request.ownerNote());

        space.replaceFacilities(cleanFacilities(request.facilities()));
        space.replacePricing(buildPricing(request.pricing()));
        space.setStatus(SpaceStatus.ACTIVE);

        return SpaceDetailResponse.from(spaceRepository.save(space), ownerId, null);
    }

    @Transactional
    public SpaceDetailResponse update(Long spaceId, Long ownerId, UpdateSpaceRequest request) {
        Space space = requireOwnedSpace(spaceId, ownerId, "modify");

        applyDetails(space, request.title(), request.description(), request.address(),
                request.latitude(), request.longitude(), request.area(), request.areaUnit(),
                request.capacity(), request.availability(), request.ownerNote());

        space.replaceFacilities(cleanFacilities(request.facilities()));
        space.replacePricing(buildPricing(request.pricing()));

        if (request.status() != null) {
            if (request.status() == SpaceStatus.DELETED) {
                throw new BadRequestException("Use DELETE /api/spaces/" + spaceId + " to delete a listing.");
            }
            space.setStatus(request.status());
        }

        return SpaceDetailResponse.from(spaceRepository.save(space), ownerId, null);
    }

    /** Soft delete: the listing keeps its history but leaves discovery. */
    @Transactional
    public void delete(Long spaceId, Long ownerId) {
        Space space = requireOwnedSpace(spaceId, ownerId, "delete");
        space.markDeleted();
        spaceRepository.save(space);
    }

    // ------------------------------------------------------------------ photos

    @Transactional
    public SpaceDetailResponse addPhotos(Long spaceId, Long ownerId, List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            throw new BadRequestException("Select at least one image to upload.");
        }

        Space space = requireOwnedSpace(spaceId, ownerId, "modify");
        List<StoredPhoto> stored = new ArrayList<>();

        try {
            for (MultipartFile file : files) {
                StoredPhoto photo = photoStorageService.store(file);
                stored.add(photo);
                space.addPhoto(new SpacePhoto(photo.url(), photo.key(), space.nextPhotoOrder()));
            }
        } catch (RuntimeException exception) {
            // Do not leave orphaned files behind when one upload in the batch fails.
            stored.forEach(photo -> photoStorageService.delete(photo.key()));
            throw exception;
        }

        return SpaceDetailResponse.from(spaceRepository.save(space), ownerId, null);
    }

    @Transactional
    public void deletePhoto(Long spaceId, Long photoId, Long ownerId) {
        Space space = requireOwnedSpace(spaceId, ownerId, "modify");

        SpacePhoto photo = space.getPhotos().stream()
                .filter(candidate -> photoId.equals(candidate.getId()))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Photo " + photoId + " was not found."));

        space.removePhoto(photo);
        spaceRepository.save(space);
        photoStorageService.delete(photo.getStorageKey());
    }

    /** Sets the gallery order to the given photo ids. */
    @Transactional
    public SpaceDetailResponse reorderPhotos(Long spaceId, Long ownerId, List<Long> photoIds) {
        Space space = requireOwnedSpace(spaceId, ownerId, "modify");

        Map<Long, SpacePhoto> byId = space.getPhotos().stream()
                .collect(java.util.stream.Collectors.toMap(SpacePhoto::getId, Function.identity()));

        if (photoIds.size() != byId.size() || !byId.keySet().containsAll(photoIds)) {
            throw new BadRequestException("Send the ids of all photos of this space, in the new order.");
        }

        for (int index = 0; index < photoIds.size(); index++) {
            byId.get(photoIds.get(index)).setDisplayOrder(index);
        }

        return SpaceDetailResponse.from(spaceRepository.save(space), ownerId, null);
    }

    // ------------------------------------------------------------------ reads

    /** Public discovery: only ACTIVE listings, with filters and pagination. */
    @Transactional(readOnly = true)
    public PageResponse<SpaceSummaryResponse> search(SpaceSearchCriteria criteria, Long viewerId) {
        Specification<Space> specification = buildSpecification(criteria);

        if (hasCoordinates(criteria)) {
            return searchWithDistance(specification, criteria);
        }

        Pageable pageable = PageRequest.of(
                Math.max(criteria.page(), 0),
                normaliseSize(criteria.size()),
                resolveSort(criteria.sort()));

        return PageResponse.from(spaceRepository.findAll(specification, pageable),
                space -> SpaceSummaryResponse.from(space, null));
    }

    /** One listing, for the details page. Deleted listings are not visible. */
    @Transactional(readOnly = true)
    public SpaceDetailResponse getPublic(Long spaceId, Long viewerId, BigDecimal fromLatitude, BigDecimal fromLongitude) {
        Space space = spaceRepository.findById(spaceId)
                .filter(candidate -> candidate.getStatus() != SpaceStatus.DELETED)
                .orElseThrow(() -> new ResourceNotFoundException("Space " + spaceId + " was not found."));

        Double distanceKm = GeoUtils.haversineKm(fromLatitude, fromLongitude,
                space.getLatitude(), space.getLongitude());

        return SpaceDetailResponse.from(space, viewerId, distanceKm);
    }

    /** Activity pricing of one space. */
    @Transactional(readOnly = true)
    public List<SpacePricingResponse> getPricing(Long spaceId) {
        Space space = spaceRepository.findById(spaceId)
                .filter(candidate -> candidate.getStatus() != SpaceStatus.DELETED)
                .orElseThrow(() -> new ResourceNotFoundException("Space " + spaceId + " was not found."));

        return sortedPricing(space).stream().map(SpacePricingResponse::from).toList();
    }

    /** Everything the authenticated user listed, including paused listings. */
    @Transactional(readOnly = true)
    public List<SpaceSummaryResponse> listMine(Long ownerId) {
        Specification<Space> specification = SpaceSpecifications.ownedBy(ownerId)
                .and((root, query, cb) -> cb.notEqual(root.get("status"), SpaceStatus.DELETED));

        return spaceRepository.findAll(specification,
                        Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(space -> SpaceSummaryResponse.from(space, null))
                .toList();
    }

    // --------------------------------------------------------------- internals

    private void applyDetails(Space space, String title, String description, String address,
                              BigDecimal latitude, BigDecimal longitude, BigDecimal area,
                              com.resource.backend.entity.AreaUnit areaUnit, Integer capacity,
                              String availability, String ownerNote) {

        space.setTitle(title.trim());
        space.setDescription(description.trim());
        space.setAddress(address.trim());
        space.setLatitude(latitude);
        space.setLongitude(longitude);
        space.setArea(area, areaUnit);
        space.setCapacity(capacity);
        space.setAvailability(blankToNull(availability));
        space.setOwnerNote(blankToNull(ownerNote));
    }

    private Specification<Space> buildSpecification(SpaceSearchCriteria criteria) {
        Specification<Space> specification = SpaceSpecifications.hasStatus(SpaceStatus.ACTIVE);

        if (criteria.q() != null && !criteria.q().isBlank()) {
            specification = specification.and(SpaceSpecifications.matchesText(criteria.q()));
        }

        if (criteria.activity() != null || criteria.maxPrice() != null) {
            specification = specification.and(
                    SpaceSpecifications.offersActivity(criteria.activity(), criteria.maxPrice()));
        }

        if (criteria.minCapacity() != null) {
            specification = specification.and(SpaceSpecifications.hasMinimumCapacity(criteria.minCapacity()));
        }

        if (criteria.minAreaSqft() != null || criteria.maxAreaSqft() != null) {
            specification = specification.and(
                    SpaceSpecifications.areaBetween(criteria.minAreaSqft(), criteria.maxAreaSqft()));
        }

        if (criteria.facilities() != null && !criteria.facilities().isEmpty()) {
            specification = specification.and(SpaceSpecifications.hasAllFacilities(criteria.facilities()));
        }

        if (hasCoordinates(criteria) && criteria.radiusKm() != null && criteria.radiusKm() > 0) {
            double latitude = criteria.latitude().doubleValue();
            double longitude = criteria.longitude().doubleValue();
            double radius = criteria.radiusKm();

            // The box only narrows the rows the database has to hand over; the
            // Haversine below decides who is really inside the radius.
            double[] box = GeoUtils.boundingBox(latitude, longitude, radius);

            specification = specification.and(SpaceSpecifications.withinBounds(
                    BigDecimal.valueOf(box[0]), BigDecimal.valueOf(box[1]),
                    BigDecimal.valueOf(box[2]), BigDecimal.valueOf(box[3])));
        }

        return specification;
    }

    /**
     * Distance based searches filter by the exact Haversine distance and are
     * paged in memory, because the distance is not a stored column.
     */
    private PageResponse<SpaceSummaryResponse> searchWithDistance(
            Specification<Space> specification, SpaceSearchCriteria criteria) {

        List<SpaceSummaryResponse> matches = spaceRepository.findAll(specification,
                        Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .limit(MAX_DISTANCE_CANDIDATES)
                .map(space -> SpaceSummaryResponse.from(space, GeoUtils.haversineKm(
                        criteria.latitude(), criteria.longitude(),
                        space.getLatitude(), space.getLongitude())))
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

    private Comparator<SpaceSummaryResponse> comparatorFor(String sort) {
        return switch (normaliseSort(sort)) {
            case "distance" -> Comparator.comparing(
                    SpaceSummaryResponse::distanceKm,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            case "capacity" -> Comparator.comparing(
                    SpaceSummaryResponse::capacity,
                    Comparator.nullsLast(Comparator.reverseOrder()));
            case "area" -> Comparator.comparing(
                    response -> areaSqftOf(response),
                    Comparator.nullsLast(Comparator.reverseOrder()));
            default -> Comparator.comparing(
                    SpaceSummaryResponse::createdAt,
                    Comparator.nullsLast(Comparator.reverseOrder()));
        };
    }

    private BigDecimal areaSqftOf(SpaceSummaryResponse response) {
        return response.area() == null || response.areaUnit() == null
                ? null
                : response.areaUnit().toSquareFeet(response.area());
    }

    private Sort resolveSort(String sort) {
        return switch (normaliseSort(sort)) {
            case "capacity" -> Sort.by(Sort.Direction.DESC, "capacity");
            case "area" -> Sort.by(Sort.Direction.DESC, "areaSqft");
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };
    }

    private String normaliseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return "newest";
        }
        return switch (sort.trim().toLowerCase()) {
            case "distance" -> "distance";
            case "capacity", "capacitydesc" -> "capacity";
            case "area", "areadesc" -> "area";
            default -> "newest";
        };
    }

    private boolean hasCoordinates(SpaceSearchCriteria criteria) {
        return criteria.latitude() != null && criteria.longitude() != null;
    }

    private int normaliseSize(int requested) {
        if (requested <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(requested, MAX_PAGE_SIZE);
    }

    private Space requireOwnedSpace(Long spaceId, Long ownerId, String action) {
        Space space = spaceRepository.findById(spaceId)
                .filter(candidate -> candidate.getStatus() != SpaceStatus.DELETED)
                .orElseThrow(() -> new ResourceNotFoundException("Space " + spaceId + " was not found."));

        if (!space.isOwnedBy(ownerId)) {
            throw new ForbiddenOperationException(
                    "You are not authorized to " + action + " this space.");
        }

        return space;
    }

    private Set<Facility> cleanFacilities(Set<Facility> facilities) {
        return facilities == null
                ? new LinkedHashSet<>()
                : new LinkedHashSet<>(facilities);
    }

    /**
     * Validates and builds the activity pricing of a listing.
     *
     * <p>The owner decides what is free; the platform only enforces the
     * arithmetic: free activities are stored with price 0, paid activities need
     * a non-negative price.</p>
     */
    private Set<SpacePricing> buildPricing(List<SpacePricingRequest> requests) {
        Set<SpacePricing> pricing = new LinkedHashSet<>();
        Set<ActivityType> seen = new LinkedHashSet<>();

        for (SpacePricingRequest request : requests) {
            if (!seen.add(request.activityType())) {
                throw new BadRequestException("Each activity can only be listed once: "
                        + request.activityType().getLabel() + ".");
            }

            boolean free = Boolean.TRUE.equals(request.isFree());
            BigDecimal price = request.price();

            if (free) {
                price = BigDecimal.ZERO;
            } else if (price == null) {
                throw new BadRequestException("Enter a price for "
                        + request.activityType().getLabel() + " or mark it as free.");
            } else if (price.signum() < 0) {
                throw new BadRequestException("Price for " + request.activityType().getLabel()
                        + " cannot be negative.");
            }

            pricing.add(new SpacePricing(request.activityType(), price, free, blankToNull(request.ownerNote())));
        }

        if (pricing.isEmpty()) {
            throw new BadRequestException("Select at least one activity.");
        }

        return pricing;
    }

    private List<SpacePricing> sortedPricing(Space space) {
        return space.getPricing().stream()
                .sorted(Comparator.comparing(SpacePricing::getActivityType))
                .toList();
    }

    private String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
