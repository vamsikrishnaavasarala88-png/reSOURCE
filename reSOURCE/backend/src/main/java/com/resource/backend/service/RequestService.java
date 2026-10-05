package com.resource.backend.service;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.resource.backend.dto.RequestResponse;
import com.resource.backend.dto.RequestSubmission;
import com.resource.backend.dto.RequestSummaryResponse;
import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.Booking;
import com.resource.backend.entity.Material;
import com.resource.backend.entity.ResourceType;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceRequest;
import com.resource.backend.entity.SpaceStatus;
import com.resource.backend.entity.User;
import com.resource.backend.exception.BadRequestException;
import com.resource.backend.exception.ConflictException;
import com.resource.backend.exception.ForbiddenOperationException;
import com.resource.backend.exception.ResourceNotFoundException;
import com.resource.backend.repository.BookingRepository;
import com.resource.backend.repository.MaterialRepository;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.SpaceRequestRepository;
import com.resource.backend.repository.UserRepository;

/**
 * Requests and the accept/reject/cancel workflow, for both marketplaces.
 *
 * <p>Every rule that matters is enforced here, on the server: who may request
 * (not the owner, not into an already booked slot, not more material than is
 * available), who may accept or reject (the owner of the space or material),
 * who may cancel (the requester only, and only while pending), and that
 * accepting a space request writes the status and the booking in one
 * transaction.</p>
 *
 * <p>A material request is the same work with a different payload: it asks for a
 * quantity, creates no booking and reveals contacts as soon as it is accepted.
 * It never touches the space booking rules, and a space request never touches
 * material quantities.</p>
 */
@Service
public class RequestService {

    /** Message used whenever a slot collides with an existing confirmed booking. */
    static final String BOOKING_CONFLICT_MESSAGE =
            "This space is already booked for the requested time.";

    /** Message used when a material request asks for more than is available. */
    static final String QUANTITY_MESSAGE =
            "You cannot request more than the available quantity.";

    /** No payment processing exists in phase 4, so this is always zero. */
    private static final BigDecimal PLATFORM_FEE = BigDecimal.ZERO;

    private final SpaceRequestRepository requestRepository;
    private final SpaceRepository spaceRepository;
    private final MaterialRepository materialRepository;
    private final BookingRepository bookingRepository;
    private final UserRepository userRepository;

    public RequestService(
            SpaceRequestRepository requestRepository,
            SpaceRepository spaceRepository,
            MaterialRepository materialRepository,
            BookingRepository bookingRepository,
            UserRepository userRepository) {
        this.requestRepository = requestRepository;
        this.spaceRepository = spaceRepository;
        this.materialRepository = materialRepository;
        this.bookingRepository = bookingRepository;
        this.userRepository = userRepository;
    }

    /**
     * Creates a pending request, for a space or for material.
     *
     * <p>The requester comes from the access token. A request that is already
     * impossible - the resource is not active, the slot is taken by a confirmed
     * booking, or more material is asked for than exists - is refused straight
     * away, while several pending requests for the same space slot may coexist
     * until the owner picks one.</p>
     */
    @Transactional
    public RequestResponse create(Long requesterId, RequestSubmission submission) {
        return switch (submission.resourceType()) {
            case SPACE -> createSpaceRequest(requesterId, submission);
            case MATERIAL -> createMaterialRequest(requesterId, submission);
        };
    }

    /** Creates a pending request for material; the quantity is checked here. */
    private RequestResponse createMaterialRequest(Long requesterId, RequestSubmission submission) {
        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException("User " + requesterId + " was not found."));

        Material material = materialRepository.findById(submission.resourceId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Material " + submission.resourceId() + " was not found."));

        if (material.isDeleted()) {
            throw new ResourceNotFoundException(
                    "Material " + submission.resourceId() + " was not found.");
        }

        if (!material.isActive()) {
            throw new ConflictException("This material is not available right now.");
        }

        if (material.isOwnedBy(requesterId)) {
            throw new BadRequestException("You cannot request your own material.");
        }

        BigDecimal quantity = requireQuantity(submission.quantityRequested(), material);

        SpaceRequest request = new SpaceRequest(requester, material, quantity,
                blankToNull(submission.message()));

        return RequestResponse.from(requestRepository.save(request), requesterId);
    }

    private RequestResponse createSpaceRequest(Long requesterId, RequestSubmission submission) {
        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException("User " + requesterId + " was not found."));

        Space space = spaceRepository.findById(submission.resourceId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Space " + submission.resourceId() + " was not found."));

        requireActiveSpace(space);

        if (space.isOwnedBy(requesterId)) {
            throw new BadRequestException("You cannot request your own space.");
        }

        requireSpaceFields(submission);
        requireTimeRange(submission.startTime(), submission.endTime());

        ActivityType purpose = parsePurpose(submission.purpose());
        SpacePricing pricing = pricingFor(space, purpose);

        if (pricing == null) {
            throw new BadRequestException(
                    "This space is not offered for " + purpose.getLabel() + ".");
        }

        if (!bookingRepository.findConfirmedOverlaps(
                space.getId(), submission.requestDate(), submission.startTime(), submission.endTime())
                .isEmpty()) {
            throw new ConflictException(BOOKING_CONFLICT_MESSAGE);
        }

        SpaceRequest request = new SpaceRequest(
                requester,
                space,
                purpose,
                submission.requestDate(),
                submission.startTime(),
                submission.endTime(),
                submission.expectedPeople(),
                blankToNull(submission.message()));

        SpaceRequest saved = requestRepository.save(request);

        return RequestResponse.from(saved, requesterId);
    }

    /** Requests the user sent, newest first. */
    @Transactional(readOnly = true)
    public List<RequestSummaryResponse> listSentBy(Long requesterId) {
        return requestRepository.findAllSentBy(requesterId).stream()
                .map(request -> RequestSummaryResponse.from(request, requesterId))
                .toList();
    }

    /** Requests for the spaces the user owns, newest first. */
    @Transactional(readOnly = true)
    public List<RequestSummaryResponse> listReceivedBy(Long ownerId) {
        return requestRepository.findAllReceivedBy(ownerId).stream()
                .map(request -> RequestSummaryResponse.from(request, ownerId))
                .toList();
    }

    /**
     * One request, for its requester or the owner of the space.
     *
     * <p>Everyone else gets a 403 with no details about the request, so ids
     * cannot be walked to read other people's requests.</p>
     */
    @Transactional(readOnly = true)
    public RequestResponse get(Long requestId, Long viewerId) {
        SpaceRequest request = requireVisibleRequest(requestId, viewerId);
        return RequestResponse.from(request, viewerId);
    }

    /**
     * Accepts a pending request and confirms the booking.
     *
     * <p>Runs as one transaction: the space row is locked first, then the state
     * checks, the overlap check, the price lookup and the booking insert all
     * happen inside that lock. If anything fails, nothing is written - a request
     * never ends up accepted without its booking.</p>
     *
     * <p>A material request is accepted without a booking: nothing is scheduled,
     * nothing is paid, and the available quantity is left exactly as it was - this
     * phase does not reserve stock. Contacts unlock on acceptance.</p>
     */
    @Transactional
    public RequestResponse accept(Long requestId, Long ownerId) {
        SpaceRequest request = requestRepository.findDetailedById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Request " + requestId + " was not found."));

        if (!request.isForOwner(ownerId)) {
            throw new ForbiddenOperationException(
                    "Only the owner of this " + (request.isMaterialRequest() ? "material" : "space")
                            + " can accept the request.");
        }

        if (!request.isPending()) {
            throw new ConflictException(
                    "Only a pending request can be accepted. This request is " + request.getStatus() + ".");
        }

        if (request.isMaterialRequest()) {
            return RequestResponse.from(requestRepository.save(acceptedMaterial(request)), ownerId);
        }

        // Serialises concurrent acceptances for the same space: everyone else
        // waits here until this transaction commits.
        Space space = spaceRepository.findByIdForUpdate(request.getSpace().getId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Space " + request.getSpace().getId() + " was not found."));

        requireActiveSpace(space);

        // Checked right before the booking is written, inside the lock.
        if (!bookingRepository.findConfirmedOverlaps(
                space.getId(), request.getRequestDate(), request.getStartTime(), request.getEndTime())
                .isEmpty()) {
            throw new ConflictException(BOOKING_CONFLICT_MESSAGE);
        }

        SpacePricing pricing = pricingFor(space, request.getPurpose());

        if (pricing == null) {
            throw new ConflictException("This space is no longer offered for "
                    + request.getPurpose().getLabel() + ".");
        }

        Booking booking = new Booking(request, amountOf(pricing), PLATFORM_FEE);

        try {
            bookingRepository.saveAndFlush(booking);
        } catch (DataIntegrityViolationException exception) {
            // The database refused the row: either this request already has a
            // booking, or the PostgreSQL overlap constraint rejected a slot that
            // slipped past the check above.
            throw new ConflictException(BOOKING_CONFLICT_MESSAGE);
        }

        request.markAccepted();
        SpaceRequest saved = requestRepository.save(request);

        return RequestResponse.from(saved, ownerId);
    }

    /** Marks a material request accepted; no booking, no quantity movement. */
    private SpaceRequest acceptedMaterial(SpaceRequest request) {
        Material material = request.getMaterial();

        if (material == null || material.isDeleted()) {
            throw new ConflictException("This material is no longer available.");
        }

        request.markAccepted();

        return request;
    }

    /** Rejects a pending request. No booking is created, no contact is revealed. */
    @Transactional
    public RequestResponse reject(Long requestId, Long ownerId) {
        SpaceRequest request = requestRepository.findDetailedById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Request " + requestId + " was not found."));

        if (!request.isForOwner(ownerId)) {
            throw new ForbiddenOperationException(
                    "Only the owner of this " + (request.isMaterialRequest() ? "material" : "space")
                            + " can reject the request.");
        }

        if (!request.isPending()) {
            throw new ConflictException(
                    "Only a pending request can be rejected. This request is " + request.getStatus() + ".");
        }

        request.markRejected();

        return RequestResponse.from(requestRepository.save(request), ownerId);
    }

    /** Cancels a pending request. Only the requester may do this. */
    @Transactional
    public RequestResponse cancel(Long requestId, Long requesterId) {
        SpaceRequest request = requestRepository.findDetailedById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Request " + requestId + " was not found."));

        if (!request.wasSentBy(requesterId)) {
            throw new ForbiddenOperationException("Only the requester can cancel this request.");
        }

        if (!request.isPending()) {
            throw new ConflictException(
                    "Only a pending request can be cancelled. This request is " + request.getStatus() + ".");
        }

        request.markCancelled();

        return RequestResponse.from(requestRepository.save(request), requesterId);
    }

    private SpaceRequest requireVisibleRequest(Long requestId, Long viewerId) {
        SpaceRequest request = requestRepository.findDetailedById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Request " + requestId + " was not found."));

        if (!request.isVisibleTo(viewerId)) {
            throw new ForbiddenOperationException(
                    "Only the requester and the owner can view this request.");
        }

        return request;
    }

    private void requireActiveSpace(Space space) {
        if (space.getStatus() != SpaceStatus.ACTIVE) {
            throw new ConflictException("This space is not accepting requests right now.");
        }
    }

    /**
     * The fields a space request cannot do without.
     *
     * <p>Presence depends on the resource type, so it is checked here rather than
     * with Bean Validation. All missing fields are reported together, keyed by
     * field name, so the form can highlight each one.</p>
     */
    private void requireSpaceFields(RequestSubmission submission) {
        Map<String, String> missing = new LinkedHashMap<>();

        if (submission.purpose() == null || submission.purpose().isBlank()) {
            missing.put("purpose", "Choose what the space is needed for.");
        }

        if (submission.requestDate() == null) {
            missing.put("requestDate", "Choose the date you need the space.");
        }

        if (submission.startTime() == null) {
            missing.put("startTime", "Choose a start time.");
        }

        if (submission.endTime() == null) {
            missing.put("endTime", "Choose an end time.");
        }

        if (submission.expectedPeople() == null) {
            missing.put("expectedPeople", "Enter how many people are expected.");
        }

        if (!missing.isEmpty()) {
            throw new BadRequestException("Please correct the highlighted fields.", missing);
        }
    }

    private void requireTimeRange(LocalTime startTime, LocalTime endTime) {
        if (!endTime.isAfter(startTime)) {
            throw new BadRequestException("The end time must be after the start time.");
        }
    }

    /**
     * The quantity a material request asks for, checked against what is listed.
     *
     * <p>The comparison only makes sense against the material's own quantity, so
     * it is done on the stored numbers and never on a client supplied unit.</p>
     */
    private BigDecimal requireQuantity(BigDecimal quantityRequested, Material material) {
        if (quantityRequested == null) {
            throw new BadRequestException("Enter how much material you need.");
        }

        if (quantityRequested.signum() <= 0) {
            throw new BadRequestException("Enter how much material you need.");
        }

        if (quantityRequested.compareTo(material.getQuantity()) > 0) {
            throw new BadRequestException(QUANTITY_MESSAGE + " This listing has "
                    + material.getQuantity().stripTrailingZeros().toPlainString() + " "
                    + material.getUnit() + ".");
        }

        return quantityRequested;
    }

    private ActivityType parsePurpose(String purpose) {
        String cleaned = purpose == null ? "" : purpose.trim().toUpperCase();

        try {
            return ActivityType.valueOf(cleaned);
        } catch (IllegalArgumentException exception) {
            throw new BadRequestException("Choose one of the activities listed for this space.");
        }
    }

    /** The owner's pricing row for an activity, or {@code null} when it is gone. */
    private SpacePricing pricingFor(Space space, ActivityType activity) {
        return space.getPricing().stream()
                .filter(entry -> entry.getActivityType() == activity)
                .findFirst()
                .orElse(null);
    }

    private BigDecimal amountOf(SpacePricing pricing) {
        return pricing.isFree() ? BigDecimal.ZERO : pricing.getPrice();
    }

    private String blankToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
