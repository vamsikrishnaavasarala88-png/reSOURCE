package com.resource.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.resource.backend.dto.AuthResponse;
import com.resource.backend.dto.LoginRequest;
import com.resource.backend.dto.RegisterRequest;
import com.resource.backend.dto.UserResponse;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.service.AuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** Creates an account. The client then calls {@code /login} to obtain a token. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** The account behind the bearer token. */
    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal ResourceUserDetails principal) {
        return authService.currentUser(principal.getId());
    }
}
