package com.resource.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.resource.backend.entity.SpaceRequest;

/**
 * Requests, whether they point at a space or at a material.
 *
 * <p>The target associations are fetched with left joins so a material request
 * (which has no space) and a space request (which has no material) both survive;
 * an inner join would silently drop one kind from every list.</p>
 */
public interface SpaceRequestRepository extends JpaRepository<SpaceRequest, Long> {

    /** Requests sent by one user, newest first. */
    @Query("""
            select r from SpaceRequest r
            left join fetch r.space s
            left join fetch s.owner
            left join fetch r.material m
            left join fetch m.owner
            join fetch r.requester
            left join fetch r.booking
            where r.requester.id = :requesterId
            order by r.createdAt desc, r.id desc
            """)
    List<SpaceRequest> findAllSentBy(@Param("requesterId") Long requesterId);

    /** Requests for the spaces or the material one user owns, newest first. */
    @Query("""
            select r from SpaceRequest r
            left join fetch r.space s
            left join fetch s.owner
            left join fetch r.material m
            left join fetch m.owner
            join fetch r.requester
            left join fetch r.booking
            where s.owner.id = :ownerId or m.owner.id = :ownerId
            order by r.createdAt desc, r.id desc
            """)
    List<SpaceRequest> findAllReceivedBy(@Param("ownerId") Long ownerId);

    @Query("""
            select r from SpaceRequest r
            left join fetch r.space s
            left join fetch s.owner
            left join fetch r.material m
            left join fetch m.owner
            join fetch r.requester
            left join fetch r.booking
            where r.id = :id
            """)
    Optional<SpaceRequest> findDetailedById(@Param("id") Long id);
}
