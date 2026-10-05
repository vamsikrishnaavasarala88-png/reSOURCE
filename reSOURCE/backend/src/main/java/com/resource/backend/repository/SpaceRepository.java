package com.resource.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.resource.backend.entity.Space;

import jakarta.persistence.LockModeType;

public interface SpaceRepository extends JpaRepository<Space, Long>, JpaSpecificationExecutor<Space> {

    /**
     * Loads a space and locks its row until the transaction ends.
     *
     * <p>Accepting a request uses this so two overlapping requests for the same
     * space cannot be confirmed at the same time: the second acceptance waits
     * for the first transaction to finish and then sees the new booking when it
     * re-checks for overlaps.</p>
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Space s where s.id = :id")
    Optional<Space> findByIdForUpdate(@Param("id") Long id);
}
