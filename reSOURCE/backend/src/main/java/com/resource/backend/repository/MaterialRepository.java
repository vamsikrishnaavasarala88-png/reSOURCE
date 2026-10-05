package com.resource.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import com.resource.backend.entity.Material;

/** Material listings. Search and filtering go through {@link MaterialSpecifications}. */
public interface MaterialRepository
        extends JpaRepository<Material, Long>, JpaSpecificationExecutor<Material> {
}
