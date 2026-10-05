-- Phase 4, PostgreSQL only: the database itself refuses to hold two confirmed
-- bookings that overlap in the same space.
--
-- The service already locks the space row and re-checks overlaps inside the
-- accepting transaction (that works on every database, including the H2 the
-- tests run on). This constraint is the second line of defence: even if a future
-- code path forgets the check, or two transactions somehow slip past it, the
-- database rejects the insert.
--
-- `[)` means the interval is half open: a booking ending at 14:00 and another
-- starting at 14:00 do not overlap, which matches the service's rule
-- (start1 < end2 AND start2 < end1).
--
-- btree_gist is needed to combine the equality checks (space_id, booking_date)
-- with the range overlap in one GiST index. It is a trusted extension, so a
-- database owner can install it without superuser rights.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
    ADD CONSTRAINT ex_bookings_no_overlap
    EXCLUDE USING gist (
        space_id WITH =,
        booking_date WITH =,
        tsrange(booking_date + start_time, booking_date + end_time, '[)') WITH &&
    )
    WHERE (status = 'CONFIRMED');
