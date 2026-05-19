# System Architecture

## Overview
This application follows a modular frontend architecture with separated concerns:
- Presentation Layer (UI)
- Business Logic Layer
- Data Layer (API/services)

## Frontend Architecture
- React-based SPA
- Component-driven development
- Feature-based folder structure

## Backend Integration
- REST API communication
- Services layer handles all API requests

## Data Flow
UI → Hooks → Services → API → Backend

## Key Rules
- No direct API calls inside components
- All API logic must go through services
- Hooks manage reusable logic