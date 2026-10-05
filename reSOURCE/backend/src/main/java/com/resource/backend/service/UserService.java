package com.resource.backend.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.resource.backend.dto.UpdateProfileRequest;
import com.resource.backend.dto.UserResponse;
import com.resource.backend.entity.User;
import com.resource.backend.exception.DuplicateEmailException;
import com.resource.backend.exception.ResourceNotFoundException;
import com.resource.backend.repository.UserRepository;

/**
 * Reads and updates the authenticated user's own profile.
 */
@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public UserResponse getById(Long id) {
        return UserResponse.from(requireUser(id));
    }

    /** Updates name, email and phone. Email must stay unique. */
    @Transactional
    public UserResponse updateProfile(Long id, UpdateProfileRequest request) {
        User user = requireUser(id);
        String email = EmailNormaliser.normalise(request.email());

        if (!email.equals(user.getEmail()) && userRepository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateEmailException(email);
        }

        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPhone(EmailNormaliser.normalisePhone(request.phone()));

        return UserResponse.from(userRepository.save(user));
    }

    private User requireUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User " + id + " was not found."));
    }
}
