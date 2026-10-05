-- Phase 5: Surplus Material Marketplace.
--
-- A material belongs to exactly one user (owner) and describes surplus
-- construction material: what it is (category), how much of it there is
-- (quantity + unit), the owner's own statement of its condition, and what the
-- owner wants for it (free or a price). Nothing here is inferred: quantity and
-- condition always come from the owner.
--
-- Deletes are soft, exactly like spaces: the row keeps its history and only
-- changes status, so a listing that someone already requested does not vanish
-- from under the request.

CREATE TABLE materials (
    id                 BIGSERIAL     PRIMARY KEY,
    owner_id           BIGINT        NOT NULL REFERENCES users (id),
    title              VARCHAR(160)  NOT NULL,
    category           VARCHAR(40)   NOT NULL,
    description        VARCHAR(2000) NOT NULL,
    quantity           NUMERIC(12, 2) NOT NULL,
    unit               VARCHAR(40)   NOT NULL,
    material_condition VARCHAR(20)   NOT NULL,
    price              NUMERIC(12, 2) NOT NULL DEFAULT 0,
    is_free            BOOLEAN       NOT NULL DEFAULT FALSE,
    address            VARCHAR(300)  NOT NULL,
    latitude           NUMERIC(9, 6),
    longitude          NUMERIC(9, 6),
    owner_note         VARCHAR(1000),
    status             VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_materials_quantity CHECK (quantity > 0),
    CONSTRAINT ck_materials_unit CHECK (length(trim(unit)) > 0),
    CONSTRAINT ck_materials_price CHECK (price >= 0),
    -- Free is the owner's decision: a free listing carries no price. A paid
    -- listing may be 0 only if the owner really typed 0 - the UI asks for a
    -- price, but the database does not invent one.
    CONSTRAINT ck_materials_free_price CHECK (NOT is_free OR price = 0),
    CONSTRAINT ck_materials_category CHECK (category IN (
        'BRICKS', 'CEMENT', 'TILES', 'WOOD', 'METAL', 'PIPES', 'SAND', 'STONE', 'OTHER')),
    CONSTRAINT ck_materials_condition CHECK (material_condition IN (
        'NEW', 'GOOD', 'USED', 'DAMAGED')),
    CONSTRAINT ck_materials_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED'))
);

CREATE INDEX idx_materials_owner_id ON materials (owner_id);
CREATE INDEX idx_materials_category ON materials (category);
CREATE INDEX idx_materials_condition ON materials (material_condition);
CREATE INDEX idx_materials_status ON materials (status);
CREATE INDEX idx_materials_is_free ON materials (is_free);
CREATE INDEX idx_materials_coordinates ON materials (latitude, longitude);
-- Quantity is only ever compared inside one unit, so the unit leads the index.
CREATE INDEX idx_materials_unit_quantity ON materials (unit, quantity);

CREATE TABLE material_photos (
    id            BIGSERIAL    PRIMARY KEY,
    material_id   BIGINT       NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
    image_url     VARCHAR(500) NOT NULL,
    storage_key   VARCHAR(255),
    display_order INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_material_photos_material_id ON material_photos (material_id, display_order);
