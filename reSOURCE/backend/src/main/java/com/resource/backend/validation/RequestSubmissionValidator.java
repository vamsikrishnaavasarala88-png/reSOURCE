package com.resource.backend.validation;

import com.resource.backend.dto.RequestSubmission;
import com.resource.backend.entity.ResourceType;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Validates the fields that only matter for one kind of request.
 *
 * <p>A space request needs an activity, a date, both times and the number of
 * people; a material request needs a positive quantity and none of those. Each
 * missing field is reported on its own so the form can highlight it.</p>
 */
public class RequestSubmissionValidator
        implements ConstraintValidator<ValidRequestSubmission, RequestSubmission> {

    @Override
    public boolean isValid(RequestSubmission submission, ConstraintValidatorContext context) {
        if (submission == null || submission.resourceType() == null) {
            // The type itself is checked by @NotNull on the record component.
            return true;
        }

        context.disableDefaultConstraintViolation();

        return submission.resourceType() == ResourceType.SPACE
                ? validateSpace(submission, context)
                : validateMaterial(submission, context);
    }

    private boolean validateSpace(RequestSubmission submission, ConstraintValidatorContext context) {
        boolean valid = true;

        valid &= require(context, "purpose",
                submission.purpose() == null || submission.purpose().isBlank(),
                "Choose what the space is needed for.");
        valid &= require(context, "requestDate", submission.requestDate() == null,
                "Choose the date you need the space.");
        valid &= require(context, "startTime", submission.startTime() == null,
                "Choose a start time.");
        valid &= require(context, "endTime", submission.endTime() == null,
                "Choose an end time.");
        valid &= require(context, "expectedPeople", submission.expectedPeople() == null,
                "Enter how many people are expected.");

        return valid;
    }

    private boolean validateMaterial(RequestSubmission submission, ConstraintValidatorContext context) {
        boolean missingQuantity = submission.quantityRequested() == null
                || submission.quantityRequested().signum() <= 0;

        return require(context, "quantityRequested", missingQuantity,
                "Enter how much material you need.");
    }

    private boolean require(
            ConstraintValidatorContext context, String field, boolean missing, String message) {

        if (!missing) {
            return true;
        }

        context.buildConstraintViolationWithTemplate(message)
                .addPropertyNode(field)
                .addConstraintViolation();

        return false;
    }
}
