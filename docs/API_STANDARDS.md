# API Standards

## Rules
- All endpoints must be centralized in /api
- No hardcoded URLs in components
- Use consistent response format

## Response Format
{
  "success": boolean,
  "data": object | array,
  "message": string
}

## Error Handling
- Always return meaningful error messages
- Standard HTTP status codes must be used

## Frontend Rules
- API calls must be inside services only
- Never call fetch/axios directly inside components