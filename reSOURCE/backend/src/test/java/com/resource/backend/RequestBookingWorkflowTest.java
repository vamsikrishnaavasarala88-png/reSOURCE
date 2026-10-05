package com.resource.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.resource.backend.entity.ActivityType;
import com.resource.backend.entity.AreaUnit;
import com.resource.backend.entity.Space;
import com.resource.backend.entity.SpacePricing;
import com.resource.backend.entity.SpaceStatus;
import com.resource.backend.repository.BookingRepository;
import com.resource.backend.repository.SpaceRepository;
import com.resource.backend.repository.SpaceRequestRepository;
import com.resource.backend.repository.UserRepository;

import tools.jackson.databind.ObjectMapper;

/**
 * End-to-end tests for the Phase 4 request, acceptance and booking workflow.
 *
 * <p>Runs on in-memory H2 in PostgreSQL mode with the real Flyway migrations.
 * The PostgreSQL only overlap constraint (V4) is not created here, which is
 * deliberate: these tests prove the service enforces every rule on its own, on
 * any database.</p>
 */
@SpringBootTest(properties = {
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:request-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "app.jwt.secret=" + RequestBookingWorkflowTest.TEST_SECRET,
        "app.jwt.expiration-minutes=60",
        "app.seed.enabled=false",
        // .env is loaded even here, so the PostgreSQL-only migration folder is
        // explicitly excluded: these tests run the portable migrations on H2.
        "spring.flyway.locations=classpath:db/migration"
})
@AutoConfigureMockMvc
class RequestBookingWorkflowTest {

    static final String TEST_SECRET = "integration-test-secret-long-enough-for-hs256-signing";

    private static final String CONFLICT_MESSAGE = "This space is already booked for the requested time.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SpaceRepository spaceRepository;

    @Autowired
    private SpaceRequestRepository requestRepository;

    @Autowired
    private BookingRepository bookingRepository;

    private String ownerToken;
    private String requesterToken;
    private String strangerToken;

    private Long ownerId;
    private Long requesterId;

    /** Community Ground: free for blood donation, paid for a student fest. */
    private Space space;

    @BeforeEach
    void setUp() throws Exception {
        // Children first: bookings reference requests, requests reference spaces.
        bookingRepository.deleteAll();
        requestRepository.deleteAll();
        spaceRepository.deleteAll();
        userRepository.deleteAll();

        ownerToken = registerAndLogin("owner@example.com", "Owner Example");
        requesterToken = registerAndLogin("requester@example.com", "Requester Example");
        strangerToken = registerAndLogin("stranger@example.com", "Stranger Example");

        ownerId = userRepository.findByEmailIgnoreCase("owner@example.com").orElseThrow().getId();
        requesterId = userRepository.findByEmailIgnoreCase("requester@example.com").orElseThrow().getId();

        space = createSpace("Community Ground");
    }

    // ---------------------------------------------------------------- create

    @Test
    void authenticatedUserCanCreateARequest() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(7), "09:00", "14:00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.statusLabel").value("Awaiting owner response"))
                .andExpect(jsonPath("$.purpose").value("BLOOD_DONATION"))
                .andExpect(jsonPath("$.purposeLabel").value("Blood Donation Camp"))
                .andExpect(jsonPath("$.expectedPeople").value(200))
                .andExpect(jsonPath("$.isFree").value(true))
                .andExpect(jsonPath("$.amount").value(0))
                .andExpect(jsonPath("$.viewerRole").value("REQUESTER"))
                .andExpect(jsonPath("$.requester.name").value("Requester Example"))
                .andExpect(jsonPath("$.owner.name").value("Owner Example"))
                .andExpect(jsonPath("$.booking").doesNotExist())
                .andExpect(jsonPath("$.contact").doesNotExist())
                // Never expose private profile data in a request payload.
                .andExpect(jsonPath("$.requester.email").doesNotExist())
                .andExpect(jsonPath("$.owner.phone").doesNotExist());
    }

    @Test
    void creatingARequestRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(7), "09:00", "14:00")))
                .andExpect(status().isUnauthorized());

        assertThat(requestRepository.count()).isZero();
    }

    @Test
    void aUserCannotRequestTheirOwnSpace() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(7), "09:00", "14:00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You cannot request your own space."));

        assertThat(requestRepository.count()).isZero();
    }

    @Test
    void requesterIdSentByTheClientIsIgnored() throws Exception {
        String body = submission("BLOOD_DONATION", LocalDate.now().plusDays(7), "09:00", "14:00")
                .replace("\"resourceType\"", "\"requesterId\": 99999, \"resourceType\"");

        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.requester.id").value(requesterId))
                .andExpect(jsonPath("$.requester.name").value("Requester Example"));
    }

    @Test
    void validationRefusesAnImpossibleRequest() throws Exception {
        // End before start.
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(3), "14:00", "09:00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The end time must be after the start time."));

        // Zero people.
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(3), "09:00", "14:00")
                                .replace("\"expectedPeople\":200", "\"expectedPeople\":0")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.expectedPeople").exists());

        // A date in the past.
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().minusDays(1), "09:00", "14:00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.requestDate").exists());

        // Blank purpose, missing times, missing space.
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceType":"SPACE","purpose":"   ","expectedPeople":10,"requestDate":"2030-01-01"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.purpose").exists())
                .andExpect(jsonPath("$.errors.startTime").exists())
                .andExpect(jsonPath("$.errors.endTime").exists());

        assertThat(requestRepository.count()).isZero();
    }

    @Test
    void anActivityTheSpaceIsNotOfferedForIsRefused() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("SPORTS", LocalDate.now().plusDays(3), "09:00", "14:00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This space is not offered for Sports."));

        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("NOT_AN_ACTIVITY", LocalDate.now().plusDays(3), "09:00", "14:00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void aRequestForAMissingSpaceIsANotFound() throws Exception {
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(3), "09:00", "14:00")
                                .replace("\"resourceId\":" + space.getId(), "\"resourceId\":999999")))
                .andExpect(status().isNotFound());
    }

    @Test
    void anInactiveSpaceCannotBeRequested() throws Exception {
        space.setStatus(SpaceStatus.INACTIVE);
        spaceRepository.save(space);

        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(3), "09:00", "14:00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This space is not accepting requests right now."));
    }

    @Test
    void aSlotThatIsAlreadyBookedCannotBeRequestedAgain() throws Exception {
        Long firstId = createRequest("BLOOD_DONATION", "10:00", "14:00");
        accept(firstId, ownerToken).andExpect(status().isOk());

        // Impossible from the start, so it is refused when it is sent.
        mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission("BLOOD_DONATION", LocalDate.now().plusDays(7), "13:00", "16:00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(CONFLICT_MESSAGE));

        // Several pending requests for a free slot may coexist; only one of them
        // can ever be accepted, which the next test proves.
        Long pendingA = createRequestOn(LocalDate.now().plusDays(8), "BLOOD_DONATION", "09:00", "14:00");
        Long pendingB = createRequestOn(LocalDate.now().plusDays(8), "BLOOD_DONATION", "09:00", "14:00");

        accept(pendingA, ownerToken).andExpect(status().isOk());
        accept(pendingB, ownerToken)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(CONFLICT_MESSAGE));

        assertThat(requestRepository.findAll()).hasSize(3);
    }

    // ------------------------------------------------------------------ read

    @Test
    void requesterAndOwnerCanViewARequest() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewerRole").value("REQUESTER"))
                .andExpect(jsonPath("$.contact").doesNotExist());

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewerRole").value("OWNER"))
                .andExpect(jsonPath("$.requester.name").value("Requester Example"))
                .andExpect(jsonPath("$.contact").doesNotExist());
    }

    @Test
    void anUnrelatedUserCannotViewARequest() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").exists());

        mockMvc.perform(get("/api/requests/{id}", requestId))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void requestListsOnlyShowWhatTheUserIsPartOf() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(get("/api/requests/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(requestId))
                .andExpect(jsonPath("$[0].spaceTitle").value("Community Ground"))
                .andExpect(jsonPath("$[0].status").value("PENDING"))
                // The requester sees who the space belongs to...
                .andExpect(jsonPath("$[0].viewerRole").value("REQUESTER"))
                .andExpect(jsonPath("$[0].counterpart.name").value("Owner Example"))
                // ...and never a phone number or an email in a list.
                .andExpect(jsonPath("$[0].counterpart.phone").doesNotExist())
                .andExpect(jsonPath("$[0].counterpart.email").doesNotExist());

        mockMvc.perform(get("/api/requests/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(requestId))
                .andExpect(jsonPath("$[0].purposeLabel").value("Blood Donation Camp"))
                .andExpect(jsonPath("$[0].amount").value(0))
                // The owner sees who is asking, name only.
                .andExpect(jsonPath("$[0].viewerRole").value("OWNER"))
                .andExpect(jsonPath("$[0].counterpart.name").value("Requester Example"));

        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ---------------------------------------------------------------- accept

    @Test
    void ownerAcceptsAPendingRequestAndABookingIsCreated() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        String response = accept(requestId, ownerToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.statusLabel").value("Booking confirmed"))
                .andExpect(jsonPath("$.booking.id").isNumber())
                .andExpect(jsonPath("$.booking.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.booking.requestId").value(requestId))
                .andExpect(jsonPath("$.booking.resourceId").value(space.getId()))
                // FREE for blood donation: a real booking with a zero amount.
                .andExpect(jsonPath("$.booking.amount").value(0))
                .andExpect(jsonPath("$.booking.platformFee").value(0))
                .andExpect(jsonPath("$.booking.totalAmount").value(0))
                .andExpect(jsonPath("$.booking.space.title").value("Community Ground"))
                .andReturn().getResponse().getContentAsString();

        Map<?, ?> payload = objectMapper.readValue(response, Map.class);
        long bookingId = ((Number) ((Map<?, ?>) payload.get("booking")).get("id")).longValue();

        assertThat(bookingRepository.count()).isEqualTo(1);

        mockMvc.perform(get("/api/bookings/{id}", bookingId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.totalAmount").value(0));

        mockMvc.perform(get("/api/bookings/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mockMvc.perform(get("/api/bookings/owner")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].requester.name").value("Requester Example"));
    }

    @Test
    void paidActivityIsBilledAtTheOwnersPrice() throws Exception {
        Long requestId = createRequest("STUDENT_FEST", "09:00", "14:00");

        accept(requestId, ownerToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.booking.amount").value(500))
                .andExpect(jsonPath("$.booking.platformFee").value(0))
                .andExpect(jsonPath("$.booking.totalAmount").value(500));
    }

    @Test
    void nonOwnerCannotAccept() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        accept(requestId, requesterToken)
                .andExpect(status().isForbidden());
        accept(requestId, strangerToken)
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/requests/{id}/accept", requestId))
                .andExpect(status().isUnauthorized());

        assertThat(bookingRepository.count()).isZero();
        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void overlappingConfirmedBookingPreventsAcceptance() throws Exception {
        // Both requests are pending; the owner accepts one, and the other cannot
        // be confirmed any more because the slot is taken.
        Long first = createRequest("BLOOD_DONATION", "10:00", "14:00");
        Long second = createRequest("BLOOD_DONATION", "12:00", "16:00");

        accept(first, ownerToken).andExpect(status().isOk());

        accept(second, ownerToken)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(CONFLICT_MESSAGE));

        // The second request stays pending, and only one booking exists.
        mockMvc.perform(get("/api/requests/{id}", second)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(jsonPath("$.status").value("PENDING"));
        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    @Test
    void backToBackBookingsDoNotConflict() throws Exception {
        Long morning = createRequest("BLOOD_DONATION", "10:00", "14:00");
        accept(morning, ownerToken).andExpect(status().isOk());

        // End time is exclusive: 14:00-16:00 touches but does not overlap.
        Long afternoon = createRequest("BLOOD_DONATION", "14:00", "16:00");
        accept(afternoon, ownerToken).andExpect(status().isOk());

        // A different day is always free.
        Long nextDay = createRequestOn(LocalDate.now().plusDays(9), "BLOOD_DONATION", "10:00", "12:00");
        accept(nextDay, ownerToken).andExpect(status().isOk());

        assertThat(bookingRepository.count()).isEqualTo(3);
    }

    // ---------------------------------------------------------------- reject

    @Test
    void ownerRejectsAPendingRequestWithoutCreatingABooking() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(post("/api/requests/{id}/reject", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.statusLabel").value("Request rejected"))
                .andExpect(jsonPath("$.booking").doesNotExist())
                .andExpect(jsonPath("$.contact").doesNotExist());

        assertThat(bookingRepository.count()).isZero();

        mockMvc.perform(get("/api/bookings/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void nonOwnerCannotReject() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(post("/api/requests/{id}/reject", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/requests/{id}/reject", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/requests/{id}/reject", requestId))
                .andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- cancel

    @Test
    void requesterCancelsTheirPendingRequest() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(post("/api/requests/{id}/cancel", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.statusLabel").value("Request cancelled"))
                .andExpect(jsonPath("$.booking").doesNotExist());

        assertThat(bookingRepository.count()).isZero();

        // A cancelled request frees the owner from acting on it.
        mockMvc.perform(post("/api/requests/{id}/accept", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isConflict());
    }

    @Test
    void nonRequesterCannotCancel() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        mockMvc.perform(post("/api/requests/{id}/cancel", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/requests/{id}/cancel", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    // ------------------------------------------------------- state machine

    @Test
    void invalidStateTransitionsAreRefused() throws Exception {
        Long accepted = createRequest("BLOOD_DONATION", "09:00", "10:00");
        accept(accepted, ownerToken).andExpect(status().isOk());

        // Accepted requests cannot be accepted, rejected or cancelled again.
        accept(accepted, ownerToken).andExpect(status().isConflict());
        mockMvc.perform(post("/api/requests/{id}/reject", accepted)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isConflict());
        mockMvc.perform(post("/api/requests/{id}/cancel", accepted)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isConflict());

        Long rejected = createRequest("BLOOD_DONATION", "11:00", "12:00");
        mockMvc.perform(post("/api/requests/{id}/reject", rejected)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk());
        accept(rejected, ownerToken).andExpect(status().isConflict());

        Long cancelled = createRequest("BLOOD_DONATION", "12:00", "13:00");
        mockMvc.perform(post("/api/requests/{id}/cancel", cancelled)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk());
        accept(cancelled, ownerToken).andExpect(status().isConflict());
        mockMvc.perform(post("/api/requests/{id}/reject", cancelled)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isConflict());

        assertThat(bookingRepository.count()).isEqualTo(1);
    }

    @Test
    void anInactiveSpaceCannotBeAccepted() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        Space current = spaceRepository.findById(space.getId()).orElseThrow();
        current.setStatus(SpaceStatus.INACTIVE);
        spaceRepository.save(current);

        accept(requestId, ownerToken)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This space is not accepting requests right now."));

        assertThat(bookingRepository.count()).isZero();
    }

    // ------------------------------------------------------------ contacts

    @Test
    void contactDetailsStayHiddenUntilTheRequestIsAccepted() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");

        // Requester view, before acceptance.
        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contact").doesNotExist())
                .andExpect(jsonPath("$.owner.phone").doesNotExist())
                .andExpect(jsonPath("$.owner.email").doesNotExist());

        // Owner view, before acceptance.
        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contact").doesNotExist())
                .andExpect(jsonPath("$.requester.phone").doesNotExist())
                .andExpect(jsonPath("$.requester.email").doesNotExist());

        // The owner's incoming list is just as private.
        mockMvc.perform(get("/api/requests/incoming")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].requester").doesNotExist())
                .andExpect(jsonPath("$[0].phone").doesNotExist());
    }

    @Test
    void contactDetailsAppearForBothPartiesAfterConfirmation() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");
        accept(requestId, ownerToken).andExpect(status().isOk());

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contact.name").value("Owner Example"))
                .andExpect(jsonPath("$.contact.phone").value("+91 90000 00000"))
                .andExpect(jsonPath("$.contact.email").value("owner@example.com"))
                .andExpect(jsonPath("$.contact.passwordHash").doesNotExist());

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contact.name").value("Requester Example"))
                .andExpect(jsonPath("$.contact.email").value("requester@example.com"));
    }

    @Test
    void unrelatedUsersCannotReachContactsOrBookings() throws Exception {
        Long requestId = createRequest("BLOOD_DONATION", "09:00", "14:00");
        String accepted = accept(requestId, ownerToken).andReturn().getResponse().getContentAsString();
        Number bookingId = (Number) ((Map<?, ?>) objectMapper.readValue(accepted, Map.class).get("booking"))
                .get("id");

        mockMvc.perform(get("/api/requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/bookings/{id}", bookingId.longValue())
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/bookings/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/bookings/owner")
                        .header(HttpHeaders.AUTHORIZATION, bearer(strangerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/bookings/{id}", bookingId.longValue()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void bookingContactIsOnlyAttachedToAConfirmedBooking() throws Exception {
        Long requestId = createRequest("STUDENT_FEST", "09:00", "14:00");
        accept(requestId, ownerToken).andExpect(status().isOk());

        // Requester sees the owner's details, owner sees the requester's.
        mockMvc.perform(get("/api/bookings/my")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].contact.email").value("owner@example.com"));

        mockMvc.perform(get("/api/bookings/owner")
                        .header(HttpHeaders.AUTHORIZATION, bearer(ownerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].contact.email").value("requester@example.com"))
                .andExpect(jsonPath("$[0].amount").value(500));
    }

    // -------------------------------------------------------------- helpers

    private org.springframework.test.web.servlet.ResultActions accept(Long requestId, String token)
            throws Exception {
        return mockMvc.perform(post("/api/requests/{id}/accept", requestId)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private Long createRequest(String activity, String startTime, String endTime) throws Exception {
        return createRequestOn(LocalDate.now().plusDays(7), activity, startTime, endTime);
    }

    private Long createRequestOn(LocalDate date, String activity, String startTime, String endTime)
            throws Exception {
        String response = mockMvc.perform(post("/api/requests")
                        .header(HttpHeaders.AUTHORIZATION, bearer(requesterToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(submission(activity, date, startTime, endTime)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        return ((Number) objectMapper.readValue(response, Map.class).get("id")).longValue();
    }

    private String submission(String activity, LocalDate date, String startTime, String endTime) {
        return """
                {"resourceType":"SPACE","resourceId":%d,"purpose":"%s","requestDate":"%s",
                 "startTime":"%s","endTime":"%s","expectedPeople":200,
                 "message":"We are organizing a local blood donation camp."}
                """.formatted(space.getId(), activity, date, startTime, endTime);
    }

    /** Space with a free activity and a paid one, owned by the owner account. */
    private Space createSpace(String title) {
        Space created = new Space(
                userRepository.findByEmailIgnoreCase("owner@example.com").orElseThrow(),
                title,
                "Open ground used for community events.",
                "Main Road, Bhimavaram");

        created.setArea(new BigDecimal("1.5"), AreaUnit.ACRES);
        created.setCapacity(500);
        created.replacePricing(Set.of(
                new SpacePricing(ActivityType.BLOOD_DONATION, BigDecimal.ZERO, true, "Free for camps"),
                new SpacePricing(ActivityType.MEDICAL_CAMP, BigDecimal.ZERO, true, null),
                new SpacePricing(ActivityType.STUDENT_FEST, new BigDecimal("500"), false, null),
                new SpacePricing(ActivityType.EXHIBITION, new BigDecimal("1000"), false, null)));

        return spaceRepository.saveAndFlush(created);
    }

    private String registerAndLogin(String email, String name) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","email":"%s","phone":"+91 90000 00000","password":"StrongPass123"}
                                """.formatted(name, email)))
                .andExpect(status().isCreated());

        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"StrongPass123"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        return (String) objectMapper.readValue(response, Map.class).get("accessToken");
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
