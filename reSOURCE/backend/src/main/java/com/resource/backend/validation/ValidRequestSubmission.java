package com.resource.backend.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Checks the parts of a request submission that depend on what is being
 * requested.
 *
 * <p>Bean Validation cannot express "these fields are required only when the
 * resource is a space" with field annotations, so the rule lives in
 * {@link RequestSubmissionValidator} and reports each missing field separately.
 * The service re-checks the same rules, because the API must stay safe even if a
 * caller reaches it another way.</p>
 */
@Documented
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = RequestSubmissionValidator.class)
public @interface ValidRequestSubmission {

    String message() default "Please correct the highlighted fields.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
