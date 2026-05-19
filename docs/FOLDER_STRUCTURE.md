# Folder Structure Standard

## React Application Structure

src/
  assets/
  components/
    shared/
  features/
    auth/
    products/
    profile/
  pages/
  hooks/
  services/
  api/
  utils/
  constants/
  store/
  layouts/
  styles/

## Rules
- components/shared → reusable UI components only
- features → business logic grouped by domain
- services → API calls only
- hooks → reusable logic only
- utils → pure helper functions only

## Strict Separation
- UI logic ≠ business logic ≠ API logic