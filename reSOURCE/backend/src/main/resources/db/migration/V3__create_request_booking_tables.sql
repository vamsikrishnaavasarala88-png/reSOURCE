-- Phase 4: space requests, acceptance and bookings.
--
-- A request is what a signed-in user sends to the owner of a space they want to
-- use. The owner accepts or rejects it; accepting creates exactly one booking
-- (enforced by the unique constraint on bookings.request_id).
--
-- `purpose` holds the activity the space is needed for (an ActivityType name),
-- which is why it is limited to 40 characters and is the key used to look up the
-- owner's SpacePricing row.

CREATE TABLE requests (
    id              BIGSERIAL    PRIMARY KEY,
    requester_id    BIGINT       NOT NULL REFERENCES users (id),
    space_id        BIGINT       NOT NULL REFERENCES spaces (id),
    resource_type   VARCHAR(20)  NOT NULL DEFAULT 'SPACE',
    purpose         VARCHAR(40)  NOT NULL,
    request_date    DATE         NOT NULL,
    start_time      TIME         NOT NULL,
    end_time        TIME         NOT NULL,
    expected_people INTEGER      NOT NULL,
    message         VARCHAR(1000),
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_requests_expected_people CHECK (expected_people > 0),
    CONSTRAINT ck_requests_time_range CHECK (end_time > start_time),
    CONSTRAINT ck_requests_resource_type CHECK (resource_type IN ('SPACE')),
    CONSTRAINT ck_requests_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'))
);

CREATE INDEX idx_requests_requester_id ON requests (requester_id);
CREATE INDEX idx_requests_space_id ON requests (space_id);
CREATE INDEX idx_requests_status ON requests (status);
CREATE INDEX idx_requests_request_date ON requests (request_date);

-- One booking per accepted request: the unique constraint makes a double booking
-- for the same request impossible even if two accepts raced.
CREATE TABLE bookings (
    id            BIGSERIAL      PRIMARY KEY,
    request_id    BIGINT         NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
    space_id      BIGINT         NOT NULL REFERENCES spaces (id),
    owner_id      BIGINT         NOT NULL REFERENCES users (id),
    requester_id  BIGINT         NOT NULL REFERENCES users (id),
    resource_type VARCHAR(20)    NOT NULL DEFAULT 'SPACE',
    resource_id   BIGINT         NOT NULL,
    booking_date  DATE           NOT NULL,
    start_time    TIME           NOT NULL,
    end_time      TIME           NOT NULL,
    amount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    platform_fee  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status        VARCHAR(20)    NOT NULL DEFAULT 'CONFIRMED',
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uk_bookings_request UNIQUE (request_id),
    CONSTRAINT ck_bookings_time_range CHECK (end_time > start_time),
    CONSTRAINT ck_bookings_amounts CHECK (amount >= 0 AND platform_fee >= 0 AND total_amount >= 0),
    CONSTRAINT ck_bookings_status CHECK (status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED'))
);

-- Used by the overlap check that runs immediately before a booking is confirmed.
CREATE INDEX idx_bookings_space_date_status ON bookings (space_id, booking_date, status);
CREATE INDEX idx_bookings_owner_id ON bookings (owner_id);
CREATE INDEX idx_bookings_requester_id ON bookings (requester_id);
