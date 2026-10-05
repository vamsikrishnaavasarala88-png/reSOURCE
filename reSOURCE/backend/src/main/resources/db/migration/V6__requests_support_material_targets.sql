-- Phase 5: the Phase 4 request table also carries material requests.
--
-- Requests are reused rather than duplicated: `resource_type` decides what a row
-- points at. A space request keeps its space, date, time range and expected
-- people; a material request carries a material and the quantity asked for and
-- has none of the space fields. The table therefore stops requiring the space
-- columns and the check constraint enforces the shape of each kind.
--
-- Existing space rows are untouched: their columns are still populated and the
-- new constraint accepts them as they are.

ALTER TABLE requests ALTER COLUMN space_id DROP NOT NULL;
ALTER TABLE requests ALTER COLUMN purpose DROP NOT NULL;
ALTER TABLE requests ALTER COLUMN request_date DROP NOT NULL;
ALTER TABLE requests ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE requests ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE requests ALTER COLUMN expected_people DROP NOT NULL;

ALTER TABLE requests ADD COLUMN material_id BIGINT REFERENCES materials (id);
ALTER TABLE requests ADD COLUMN quantity_requested NUMERIC(12, 2);

ALTER TABLE requests DROP CONSTRAINT ck_requests_resource_type;
ALTER TABLE requests ADD CONSTRAINT ck_requests_resource_type
    CHECK (resource_type IN ('SPACE', 'MATERIAL'));

-- A space request must be complete; a material request must carry a positive
-- quantity and no space fields. Exactly one target per row, always.
ALTER TABLE requests ADD CONSTRAINT ck_requests_target CHECK (
    (resource_type = 'SPACE'
        AND space_id IS NOT NULL
        AND material_id IS NULL
        AND quantity_requested IS NULL)
    OR
    (resource_type = 'MATERIAL'
        AND material_id IS NOT NULL
        AND space_id IS NULL
        AND quantity_requested IS NOT NULL
        AND quantity_requested > 0));

CREATE INDEX idx_requests_material_id ON requests (material_id);
CREATE INDEX idx_requests_resource_type ON requests (resource_type);
