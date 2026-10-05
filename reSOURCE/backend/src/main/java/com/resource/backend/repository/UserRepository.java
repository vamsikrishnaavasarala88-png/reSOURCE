package com.resource.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.resource.backend.entity.User;

public interface UserRepository extends JpaRepository<User, Long> {

    /** Emails are stored lower-cased, so lookups are case-insensitive. */
    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);
}
