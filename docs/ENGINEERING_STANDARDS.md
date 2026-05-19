# Engineering Standards

## 1. Core Principles
All code must follow:
- SOLID Principles
- Single Responsibility Principle
- Separation of Concerns
- DRY (Don't Repeat Yourself)
- KISS (Keep It Simple)

## 2. Code Quality Rules
- Code must be human-readable first
- No cryptic abbreviations or unclear naming
- No overly complex logic in a single function
- No "god components" or "god services"

## 3. Naming Conventions
BAD:
- usr, btn, tmp, calcFn

GOOD:
- userProfile, submitButton, temporaryData, calculateTotalPrice

## 4. File Rules
- One responsibility per file
- Max file size: 300–400 lines
- Split large components immediately

## 5. React Rules
- No business logic inside JSX
- Use hooks for reusable logic
- Avoid prop drilling
- Use composition over duplication
- Separate UI, logic, and API calls

## 6. State Management
- Use centralized state only when necessary
- Avoid global state pollution
- Keep state close to where it is used

## 7. Error Handling
- Every API call must handle:
  - loading state
  - error state
  - empty state

## 8. Performance Rules
- Use lazy loading for routes
- Avoid unnecessary re-renders
- Optimize large lists (pagination/virtualization)
- Memoize expensive computations

## 9. Security Rules
- Never expose secrets in frontend
- Validate all inputs
- Sanitize API responses
- Use secure authentication practices

## 10. AI / Agent Rule
Any AI tool must:
- Follow this document strictly
- Refactor before adding new features if violations exist