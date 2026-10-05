# reSOURCE

### Reuse. Reimagine. Reconnect.

> What is unused by one person can be useful to another.

reSOURCE is an AI-powered, location-aware resource-sharing marketplace that helps people discover, list, request, and reuse underutilized physical resources.

The platform focuses on two independent categories:

- 🏞️ Underused Spaces
- ♻️ Surplus Construction Materials

Instead of allowing useful resources to remain idle or become waste, reSOURCE creates a local digital marketplace where people who have resources can connect with people who need them.

---

## 🚀 Why reSOURCE?

Every day, valuable resources remain unused.

A community ground may sit empty for most of the month while an organization struggles to find an affordable venue.

After a construction project, hundreds of bricks, wooden boards, pipes, tiles, or other materials may remain unused even though someone nearby needs them.

The problem is not always a lack of resources.

> The problem is that the people who have them and the people who need them often cannot discover each other.

reSOURCE addresses this discovery and coordination gap.

---

# ✨ Key Features

## 🏞️ Space Marketplace

Discover and list underused physical spaces such as:

- Community grounds
- Open spaces
- Halls
- Event spaces
- Exhibition spaces
- Community-use locations

Users can search spaces using:

- Activity
- Capacity
- Area
- Price
- Facilities
- Availability
- Location
- Geographic radius

### Activity-specific pricing

A space can have different prices depending on its purpose.

| Activity | Price |
|---|---:|
| Student Fest | ₹500/day |
| Market | ₹500/day |
| Exhibition | ₹1,000/day |
| Medical Camp | FREE |
| Blood Donation Camp | FREE |

This makes the marketplace more realistic for community-oriented use cases.

---

# ♻️ Surplus Material Marketplace

Users can list surplus construction materials such as:

- 🧱 Bricks
- 🪵 Wood
- 🧱 Tiles
- 🔩 Metal
- 🚰 Pipes
- 🏗️ Cement
- ⛰️ Sand
- 🪨 Stone
- Other construction materials

Each listing can include:

- Quantity
- Unit
- Condition
- Price
- Photos
- Description
- Location

Users can discover materials nearby and submit requests to owners.

---

# 🤖 AI-Powered Intelligence

AI is integrated as an assistive layer, not as the source of truth.

## 🔎 Natural-Language Search

Users don't need to understand complicated filters.

For example:

> "Find a free space for a blood donation camp for 200 people within 10 km."

AI converts the request into structured search intent:

```json
{
  "resourceType": "SPACE",
  "activity": "BLOOD_DONATION",
  "maxPrice": 0,
  "freeOnly": true,
  "capacity": 200,
  "radiusKm": 10
}
```

The backend then performs the actual search against the database.

**AI understands. Backend verifies.**

---

## 📷 Material Image Recognition

Users can photograph surplus materials.

The AI can suggest:

- Material category
- Material name
- Condition
- Confidence score

Example:

```json
{
  "materialName": "Red Clay Bricks",
  "category": "BRICKS",
  "condition": "GOOD",
  "confidence": 0.94
}
```

The user can review and edit the AI suggestion before publishing.

**AI does not estimate exact quantity from an image.**

Quantity remains user-controlled.

---

## ✍️ AI-Assisted Listing Extraction

Users can describe their material naturally:

> "I have around 300 red clay bricks in good condition in Jaggampeta for 2000 rupees."

AI can extract structured information such as:

```json
{
  "title": "Red Clay Bricks",
  "category": "BRICKS",
  "condition": "GOOD",
  "quantity": 300,
  "quantityUnit": "pieces",
  "price": 2000,
  "isFree": false,
  "locationText": "Jaggampeta"
}
```

The user reviews the information before publishing.

---

# 📍 Location Intelligence

reSOURCE is designed for local resource discovery.

The platform supports:

- GPS-based location
- Interactive maps
- Resource markers
- Geographic distance calculation
- Radius-based discovery
- Location selection while creating listings
- Navigation/directions

Example:

```text
📍 Community Ground
4.2 km away
Capacity: 500
FREE for Blood Donation Camps
```

Distance is calculated from actual coordinates by the backend.

**AI does not invent or calculate authoritative geographic information.**

---

# 🔄 Request & Approval Workflow

reSOURCE is more than a listing platform.

### Space Flow

```text
Discover Space
      ↓
View Details
      ↓
Submit Request
      ↓
Owner Reviews
      ↓
Accept / Reject
      ↓
Booking Confirmed
      ↓
Contact Details Revealed
```

### Material Flow

```text
Discover Material
      ↓
View Details
      ↓
Request Quantity
      ↓
Owner Reviews
      ↓
Accept / Reject
      ↓
Request Confirmed
      ↓
Contact Details Revealed
```

---

# 🔐 Privacy & Security

Security is built into the architecture.

### Authentication

- JWT-based authentication
- BCrypt password hashing
- Protected APIs
- Session restoration
- Role-based administrative access

### Authorization

The backend verifies:

- Resource ownership
- Request ownership
- Permission to edit/delete
- Permission to accept/reject requests

### Contact Privacy

Private contact information is not exposed before request acceptance.

After acceptance, the relevant parties can access the configured contact information.

### AI Security

AI APIs are called from the backend.

API keys are never exposed to the frontend.

AI cannot:

- Modify the database directly
- Approve requests
- Change prices
- Change ownership
- Bypass authorization
- Invent marketplace data

---

# 🧠 Core Architecture

```text
                         reSOURCE
                            │
              ┌─────────────┴─────────────┐
              │                           │
        Space Marketplace          Material Marketplace
              │                           │
              └─────────────┬─────────────┘
                            │
                     Spring Boot API
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       PostgreSQL       AI Service       Location
          │                 │                 │
          │           AI Provider         Maps/GPS
          │
      Resource Data
```

---

# 🏗️ Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Lucide React

## Backend

- Java 21
- Spring Boot
- Spring Web
- Spring Data JPA
- Spring Security
- Bean Validation

## Database

- PostgreSQL

## AI

- Configurable OpenAI-compatible multimodal AI provider
- Structured JSON responses
- Image understanding
- Natural-language intent extraction

## Maps & Location

- Browser Geolocation API
- OpenStreetMap / Leaflet-based mapping

## Storage

- Cloudinary or equivalent image storage

## Development

- Git
- GitHub
- Docker
- Docker Compose

---

# 📊 Core Data Model

```text
User
 │
 ├── Spaces
 │     └── Space Pricing
 │
 ├── Materials
 │     └── Material Photos
 │
 ├── Requests
 │
 └── Bookings
```

### Main Entities

- User
- Space
- SpacePricing
- Material
- MaterialPhoto
- Request
- Booking

Spaces and materials remain independent marketplace resources.

---

# 🔌 API Overview

## Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

## Users

```text
GET /api/users/me
PUT /api/users/me
```

## Spaces

```text
GET    /api/spaces
GET    /api/spaces/{id}
POST   /api/spaces
PUT    /api/spaces/{id}
DELETE /api/spaces/{id}
GET    /api/spaces/search
```

## Materials

```text
GET    /api/materials
GET    /api/materials/{id}
POST   /api/materials
PUT    /api/materials/{id}
DELETE /api/materials/{id}
GET    /api/materials/search
```

## Requests

```text
POST /api/requests
GET  /api/requests/my
GET  /api/requests/incoming
GET  /api/requests/{id}
```

## Bookings

```text
GET /api/bookings/my
GET /api/bookings/owner
GET /api/bookings/{id}
```

## AI

```text
POST /api/ai/search-intent
POST /api/ai/material-recognition
POST /api/ai/listing-extraction
```

## Health

```text
GET /api/health
```

---

# 🎯 Example Demo Scenario

## Scenario 1 — Find a Space

User searches:

> "I need a free space for a blood donation camp for 200 people within 10 km."

reSOURCE:

```text
AI
 ↓
Extract search intent
 ↓
Backend validates filters
 ↓
Geographic search
 ↓
Actual database results
 ↓
Community Ground
 ↓
Request
 ↓
Owner accepts
 ↓
Booking confirmed
```

---

## Scenario 2 — Reuse Surplus Bricks

A user has:

> 300 red clay bricks in good condition.

They photograph the bricks.

```text
Camera
   ↓
AI Recognition
   ↓
BRICKS / GOOD
   ↓
User confirms
   ↓
Adds quantity + price
   ↓
Publishes listing
   ↓
Nearby user discovers
   ↓
Requests material
   ↓
Owner accepts
```

---

# 🌍 Real-World Impact

reSOURCE can help:

- Reduce construction material waste
- Improve utilization of unused spaces
- Support local communities
- Help NGOs and social organizations find affordable venues
- Enable reuse of surplus construction materials
- Create local resource-sharing networks
- Reduce unnecessary consumption of new resources

The platform can eventually expand beyond construction and community spaces into broader categories of physical resource sharing.

---

# 🚀 Future Scope

Potential future improvements include:

- 🎤 Voice-based search and listing
- 🔔 Real-time notifications
- 📱 Mobile application
- 💳 Online payments
- ⭐ Ratings and reviews
- 🪪 User/resource verification
- 📊 Resource utilization analytics
- 🧠 Improved AI recommendations
- ♻️ Sustainability and waste-impact tracking
- 📱 QR-based resource verification
- 🏙️ Community and municipal resource networks

---

# 🏆 What Makes reSOURCE Different?

reSOURCE is not just an AI chatbot and not just a classifieds platform.

It combines:

```text
📷 Camera
     ↓
🤖 AI understands

🎤 Natural Language
     ↓
🔎 Intent extraction

📍 GPS
     ↓
🗺️ Local discovery

🏪 Marketplace
     ↓
🤝 Resource exchange

🔐 Backend validation
     ↓
🛡️ Reliable transactions
```

The key principle is:

> **AI assists. The backend verifies. The user decides.**

This keeps the system useful while avoiding unreliable AI-generated marketplace data.

---

# 👥 Team

Built by a multidisciplinary student team with experience across:

- Artificial Intelligence
- Full-stack development
- Java / Spring Boot
- React
- Robotics
- Hardware systems
- VLSI / RTL Design
- Open-source development
- Hackathons and technology competitions

Our team combines software, AI, robotics, and hardware perspectives to rapidly turn real-world problems into working prototypes.

---

# 📌 Project Status

**Status: 🚀 Hackathon Prototype / Working MVP**

Core functionality implemented across:

- Authentication
- Space Marketplace
- Space Requests & Bookings
- Activity-specific Pricing
- Surplus Material Marketplace
- Material Requests
- AI Intelligence Layer
- Location & Geographic Discovery
- Maps
- Privacy & Authorization

---

# 💡 Philosophy

> **What is unused by one person can be useful to another.**

## reSOURCE

### Reuse. Reimagine. Reconnect.
```
