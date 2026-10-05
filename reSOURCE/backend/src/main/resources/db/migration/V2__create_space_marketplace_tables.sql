-- Phase 3: Space Marketplace.
-- A space belongs to exactly one user (owner). Pricing is activity specific and
-- lives in its own table; deleted listings keep their row and only change status.

CREATE TABLE spaces (
    id          BIGSERIAL    PRIMARY KEY,
    owner_id    BIGINT       NOT NULL REFERENCES users (id),
    title       VARCHAR(160) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    address     VARCHAR(300) NOT NULL,
    latitude    NUMERIC(9, 6),
    longitude   NUMERIC(9, 6),
    area        NUMERIC(12, 2) NOT NULL,
    area_unit   VARCHAR(20)  NOT NULL,
    area_sqft   NUMERIC(14, 2) NOT NULL,
    capacity    INTEGER      NOT NULL,
    availability VARCHAR(500),
    owner_note  VARCHAR(1000),
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_spaces_owner_id ON spaces (owner_id);
CREATE INDEX idx_spaces_status ON spaces (status);
CREATE INDEX idx_spaces_area_sqft ON spaces (area_sqft);
CREATE INDEX idx_spaces_coordinates ON spaces (latitude, longitude);

CREATE TABLE space_photos (
    id            BIGSERIAL    PRIMARY KEY,
    space_id      BIGINT       NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    image_url     VARCHAR(500) NOT NULL,
    storage_key   VARCHAR(255),
    display_order INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_space_photos_space_id ON space_photos (space_id, display_order);

CREATE TABLE space_facilities (
    id       BIGSERIAL   PRIMARY KEY,
    space_id BIGINT      NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    facility VARCHAR(40) NOT NULL,
    CONSTRAINT uk_space_facility UNIQUE (space_id, facility)
);

CREATE INDEX idx_space_facilities_facility ON space_facilities (facility);

CREATE TABLE space_pricing (
    id            BIGSERIAL     PRIMARY KEY,
    space_id      BIGINT        NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
    activity_type VARCHAR(40)   NOT NULL,
    price         NUMERIC(12, 2) NOT NULL DEFAULT 0,
    is_free       BOOLEAN       NOT NULL DEFAULT FALSE,
    owner_note    VARCHAR(500),
    CONSTRAINT uk_space_activity UNIQUE (space_id, activity_type)
);

CREATE INDEX idx_space_pricing_activity_type ON space_pricing (activity_type);
CREATE INDEX idx_space_pricing_space_id ON space_pricing (space_id);
