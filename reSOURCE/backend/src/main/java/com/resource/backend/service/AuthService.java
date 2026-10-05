package com.resource.backend.service;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.resource.backend.dto.AuthResponse;
import com.resource.backend.dto.LoginRequest;
import com.resource.backend.dto.RegisterRequest;
import com.resource.backend.dto.UserResponse;
import com.resource.backend.entity.User;
import com.resource.backend.exception.DuplicateEmailException;
import com.resource.backend.exception.ResourceNotFoundException;
import com.resource.backend.repository.UserRepository;
import com.resource.backend.security.JwtService;
import com.resource.backend.security.ResourceUserDetails;

/**
 * Registration and login. Passwords are hashed with BCrypt before they touch the
 * database and are never returned by the API.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    /** Creates an account with the default {@code USER} role. */
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = EmailNormaliser.normalise(request.email());

        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateEmailException(email);
        }

        User user = new User(
                request.name().trim(),
                email,
                EmailNormaliser.normalisePhone(request.phone()),
                passwordEncoder.encode(request.password()));

        return UserResponse.from(userRepository.save(user));
    }

    /** Verifies credentials and issues an access token. */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = EmailNormaliser.normalise(request.email());

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, request.password()));

        ResourceUserDetails principal = (ResourceUserDetails) authentication.getPrincipal();
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password."));

        return AuthResponse.bearer(jwtService.generateToken(user), UserResponse.from(user));
    }

    /** The account behind the current token. */
    @Transactional(readOnly = true)
    public UserResponse currentUser(Long userId) {
        return userRepository.findById(userId)
                .map(UserResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("User " + userId + " no longer exists."));
    }
}
