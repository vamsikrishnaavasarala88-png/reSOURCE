package com.resource.backend.controller;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.resource.backend.dto.UpdateProfileRequest;
import com.resource.backend.dto.UserResponse;
import com.resource.backend.security.ResourceUserDetails;
import com.resource.backend.service.UserService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal ResourceUserDetails principal) {
        return userService.getById(principal.getId());
    }

    @PutMapping("/me")
    public UserResponse updateMe(
            @AuthenticationPrincipal ResourceUserDetails principal,
            @Valid @RequestBody UpdateProfileRequest request) {
        return userService.updateProfile(principal.getId(), request);
    }
}
