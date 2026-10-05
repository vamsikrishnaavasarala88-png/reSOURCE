/**
 * Client side checks that mirror the backend Bean Validation rules, so users
 * get feedback before a request is sent. The backend always re-validates.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+0-9][0-9\-\s]{5,19}$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function nameError(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Name is required.';
  if (name.length < 2) return 'Name must be at least 2 characters.';
  if (name.length > 120) return 'Name must be at most 120 characters.';
  return undefined;
}

function emailError(value: string): string | undefined {
  if (!value.trim()) return 'Email is required.';
  if (!isValidEmail(value)) return 'Enter a valid email address.';
  if (value.trim().length > 255) return 'Email must be at most 255 characters.';
  return undefined;
}

function phoneError(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return undefined; // optional
  if (!PHONE_PATTERN.test(phone)) return 'Enter a valid phone number.';
  return undefined;
}

function passwordError(value: string): string | undefined {
  if (!value) return 'Password is required.';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return undefined;
}

function compact(errors: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function validateLogin(values: { email: string; password: string }): Record<string, string> {
  return compact({
    email: values.email.trim() ? undefined : 'Email is required.',
    password: values.password ? undefined : 'Password is required.',
  });
}

export function validateRegister(values: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}): Record<string, string> {
  return compact({
    name: nameError(values.name),
    email: emailError(values.email),
    phone: phoneError(values.phone),
    password: passwordError(values.password),
    confirmPassword:
      values.password !== values.confirmPassword ? 'Passwords do not match.' : undefined,
  });
}

export function validateProfile(values: {
  name: string;
  email: string;
  phone: string;
}): Record<string, string> {
  return compact({
    name: nameError(values.name),
    email: emailError(values.email),
    phone: phoneError(values.phone),
  });
}

/* ------------------------------------------------------------------ spaces */

export interface SpacePricingDraft {
  id: string;
  activityType: string;
  isFree: boolean;
  price: string;
  ownerNote: string;
}

export interface SpaceFormDraft {
  title: string;
  description: string;
  address: string;
  latitude: string;
  longitude: string;
  area: string;
  capacity: string;
  availability: string;
  ownerNote: string;
  pricing: SpacePricingDraft[];
}

function requiredText(value: string, label: string, max: number): string | undefined {
  const text = value.trim();

  if (!text) return `${label} is required.`;
  if (text.length > max) return `${label} must be at most ${max} characters.`;
  return undefined;
}

function positiveNumber(
  value: string,
  label: string,
  options: { min?: number; max?: number; allowZero?: boolean } = {},
): string | undefined {
  const text = value.trim();

  if (!text) return `${label} is required.`;

  const parsed = Number(text);

  if (!Number.isFinite(parsed)) return `Enter ${label.toLowerCase()} as a number.`;
  if (options.min !== undefined && parsed < options.min) {
    return `${label} must be at least ${options.min}.`;
  }
  if (options.max !== undefined && parsed > options.max) {
    return `${label} must be at most ${options.max}.`;
  }
  if (!options.allowZero && parsed <= 0) return `${label} must be greater than 0.`;
  if (options.allowZero && parsed < 0) return `${label} cannot be negative.`;
  return undefined;
}

function coordinate(value: string, label: string, limit: number): string | undefined {
  const text = value.trim();

  if (!text) return undefined; // optional, filled in from the address if known

  const parsed = Number(text);

  if (!Number.isFinite(parsed)) return `Enter ${label.toLowerCase()} as a number.`;
  if (parsed < -limit || parsed > limit) {
    return `${label} must be between -${limit} and ${limit}.`;
  }
  return undefined;
}

/**
 * Mirrors the backend validation for a space listing. Keys follow the API field
 * names (`pricing[0].price`) so server side messages can be shown the same way.
 */
export function validateSpaceForm(values: SpaceFormDraft): Record<string, string> {
  const errors: Record<string, string | undefined> = {
    title: requiredText(values.title, 'Title', 140),
    description: requiredText(values.description, 'Description', 2000),
    address: requiredText(values.address, 'Address', 255),
    area: positiveNumber(values.area, 'Area'),
    capacity: positiveNumber(values.capacity, 'Capacity'),
    latitude: coordinate(values.latitude, 'Latitude', 90),
    longitude: coordinate(values.longitude, 'Longitude', 180),
  };

  if (!values.pricing.length) {
    errors.pricing = 'Add at least one activity you are willing to host.';
  }

  const seen = new Set<string>();

  values.pricing.forEach((row, index) => {
    if (!row.activityType) {
      errors[`pricing[${index}].activityType`] = 'Choose an activity.';
      return;
    }

    if (seen.has(row.activityType)) {
      errors[`pricing[${index}].activityType`] = 'Each activity can only be listed once.';
      return;
    }

    seen.add(row.activityType);

    if (row.isFree) {
      return;
    }

    const priceError = positiveNumber(row.price, 'Price', { allowZero: true });

    if (priceError === 'Price is required.') {
      errors[`pricing[${index}].price`] =
        'Enter a price for this activity or mark it as free.';
      return;
    }

    errors[`pricing[${index}].price`] = priceError;
  });

  return compact(errors);
}

/** Mirrors the backend rules for structured space search filters. */
export function validateSpaceFilters(values: {
  minArea: string;
  maxArea: string;
  minCapacity: string;
  maxPrice: string;
}): Record<string, string> {
  const errors: Record<string, string | undefined> = {
    minArea: values.minArea.trim()
      ? positiveNumber(values.minArea, 'Minimum area', { allowZero: true })
      : undefined,
    maxArea: values.maxArea.trim()
      ? positiveNumber(values.maxArea, 'Maximum area', { allowZero: true })
      : undefined,
    minCapacity: values.minCapacity.trim()
      ? positiveNumber(values.minCapacity, 'Minimum capacity', { allowZero: true })
      : undefined,
    maxPrice: values.maxPrice.trim()
      ? positiveNumber(values.maxPrice, 'Maximum price', { allowZero: true })
      : undefined,
  };

  if (!errors.minArea && !errors.maxArea) {
    const min = Number(values.minArea);
    const max = Number(values.maxArea);

    if (values.minArea.trim() && values.maxArea.trim() && min > max) {
      errors.maxArea = 'Maximum area must be greater than the minimum.';
    }
  }

  return compact(errors);
}

export interface MaterialFormDraft {
  title: string;
  category: string;
  description: string;
  quantity: string;
  unit: string;
  condition: string;
  price: string;
  isFree: boolean;
  address: string;
  latitude: string;
  longitude: string;
  ownerNote: string;
}

/**
 * Client side checks for the material form. The backend validates all of it
 * again; this exists so the owner is told before a round trip, not instead of it.
 */
export function validateMaterialForm(values: MaterialFormDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = values.title.trim();
  const description = values.description.trim();

  if (!title) {
    errors.title = 'Title is required.';
  } else if (title.length < 3) {
    errors.title = 'Title must be at least 3 characters.';
  } else if (title.length > 160) {
    errors.title = 'Title must be at most 160 characters.';
  }

  if (!values.category) {
    errors.category = 'Choose a category.';
  }

  if (!description) {
    errors.description = 'Description is required.';
  } else if (description.length < 10) {
    errors.description = 'Description must be at least 10 characters.';
  } else if (description.length > 2000) {
    errors.description = 'Description must be at most 2000 characters.';
  }

  if (!values.quantity.trim()) {
    errors.quantity = 'Quantity is required.';
  } else if (!(Number(values.quantity) > 0)) {
    errors.quantity = 'Quantity must be greater than 0.';
  }

  if (!values.unit.trim()) {
    errors.unit = 'Unit is required.';
  } else if (values.unit.trim().length > 40) {
    errors.unit = 'Unit must be at most 40 characters.';
  }

  if (!values.condition) {
    errors.condition = 'Choose the condition of the material.';
  }

  if (!values.isFree) {
    if (!values.price.trim()) {
      errors.price = 'Enter a price, or mark the material as free.';
    } else if (Number.isNaN(Number(values.price)) || Number(values.price) < 0) {
      errors.price = 'Price cannot be negative.';
    }
  }

  if (!values.address.trim()) {
    errors.address = 'Address is required.';
  } else if (values.address.trim().length > 300) {
    errors.address = 'Address must be at most 300 characters.';
  }

  // Coordinates are no longer typed in by hand: they are carried over from a
  // listing that already had them, so these only guard against stored garbage.
  if (values.latitude.trim() && Math.abs(Number(values.latitude)) > 90) {
    errors.latitude = 'Latitude must be between -90 and 90.';
  }

  if (values.longitude.trim() && Math.abs(Number(values.longitude)) > 180) {
    errors.longitude = 'Longitude must be between -180 and 180.';
  }

  if (values.ownerNote.trim().length > 1000) {
    errors.ownerNote = 'Owner note must be at most 1000 characters.';
  }

  return errors;
}

/** The material filter bar: nothing here should ever produce a 400. */
export function validateMaterialFilters(values: {
  minQuantity: string;
  unit: string;
  maxPrice: string;
  radiusKm: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (values.minQuantity.trim()) {
    if (Number.isNaN(Number(values.minQuantity)) || Number(values.minQuantity) < 0) {
      errors.minQuantity = 'Enter a quantity of 0 or more.';
    } else if (!values.unit.trim()) {
      // The backend refuses a quantity filter without a unit, on purpose.
      errors.unit = 'Choose a unit to compare quantities in.';
    }
  }

  if (values.maxPrice.trim() && (Number.isNaN(Number(values.maxPrice)) || Number(values.maxPrice) < 0)) {
    errors.maxPrice = 'Enter a price of 0 or more.';
  }

  if (Number.isNaN(Number(values.radiusKm)) || Number(values.radiusKm) < 0) {
    errors.radiusKm = 'Choose a radius.';
  }

  return errors;
}
