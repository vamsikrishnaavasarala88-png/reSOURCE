/**
 * API paths, relative to `VITE_API_BASE_URL`.
 * Later phases add their own grouped endpoints here.
 */
export const endpoints = {
  health: '/health',
  register: '/auth/register',
  login: '/auth/login',
  authMe: '/auth/me',
  usersMe: '/users/me',

  /** Space marketplace. */
  spaces: '/spaces',
  spacesSearch: '/spaces/search',
  spacesMine: '/spaces/mine',
  spaceById: (id: number | string) => `/spaces/${id}`,
  spacePricing: (id: number | string) => `/spaces/${id}/pricing`,
  spacePhotos: (id: number | string) => `/spaces/${id}/photos`,
  spacePhoto: (id: number | string, photoId: number) => `/spaces/${id}/photos/${photoId}`,
  spacePhotoOrder: (id: number | string) => `/spaces/${id}/photos/order`,

  /** Space request workflow. */
  requests: '/requests',
  requestsMine: '/requests/my',
  requestsIncoming: '/requests/incoming',
  requestById: (id: number | string) => `/requests/${id}`,
  requestAccept: (id: number | string) => `/requests/${id}/accept`,
  requestReject: (id: number | string) => `/requests/${id}/reject`,
  requestCancel: (id: number | string) => `/requests/${id}/cancel`,

  /** Surplus material marketplace. */
  materials: '/materials',
  materialsSearch: '/materials/search',
  materialsMine: '/materials/mine',
  materialById: (id: number | string) => `/materials/${id}`,
  materialPhotos: (id: number | string) => `/materials/${id}/photos`,
  materialPhoto: (id: number | string, photoId: number) => `/materials/${id}/photos/${photoId}`,
  materialPhotoOrder: (id: number | string) => `/materials/${id}/photos/order`,

  /** AI intelligence layer (Phase 6). All of it runs on the backend. */
  aiSearchIntent: '/ai/search-intent',
  aiMaterialRecognition: '/ai/material-recognition',
  aiListingExtraction: '/ai/listing-extraction',
  aiGenerateDescription: '/ai/generate-description',

  /** Confirmed bookings (read only: accepting a request creates them). */
  bookingsMine: '/bookings/my',
  bookingsOwner: '/bookings/owner',
  bookingById: (id: number | string) => `/bookings/${id}`,
} as const;
