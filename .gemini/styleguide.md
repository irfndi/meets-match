# MeetsMatch Code Style Guide

This style guide defines coding conventions and best practices for the MeetsMatch platform, which consists of a Go Telegram bot service, TypeScript API, and React frontend.

## General Principles

- **Consistency**: Follow established patterns within each language ecosystem
- **Readability**: Code should be self-documenting and easy to understand
- **Security**: Always consider security implications, especially for user data
- **Performance**: Write efficient code that scales with user growth
- **Maintainability**: Structure code for long-term maintenance and team collaboration

## Go Best Practices (Bot Service)

### Naming Conventions
- Use `PascalCase` for exported functions, types, and constants
- Use `camelCase` for unexported functions and variables
- Use descriptive names: `getUserProfile()` not `getUP()`
- Interface names should end with `-er`: `UserMatcher`, `MessageHandler`

### Code Structure
- Keep functions under 50 lines when possible
- Use early returns to reduce nesting
- Group related functionality in packages
- Separate business logic from Telegram API handling

### Error Handling
```go
// Preferred: explicit error handling
if err != nil {
    return fmt.Errorf("failed to process user: %w", err)
}

// Avoid: ignoring errors
user, _ := getUserByID(id) // Don't do this
```

### Telegram Bot Specific
- Always validate incoming messages before processing
- Use context for request timeouts and cancellation
- Log user interactions for debugging (without sensitive data)
- Handle rate limiting gracefully

### Database Operations
- Use prepared statements for SQL queries
- Always use transactions for multi-step operations
- Implement proper connection pooling
- Never log sensitive user data

## TypeScript API Best Practices

### Type Safety
- Define explicit interfaces for all API requests/responses
- Use strict TypeScript configuration
- Avoid `any` type - use `unknown` if necessary
- Implement proper input validation with type guards

### API Design
- Use RESTful conventions consistently
- Implement proper HTTP status codes
- Include comprehensive error responses
- Version your APIs (`/api/v1/`)

### Code Organization
```typescript
// Preferred structure
interface UserMatchRequest {
  userId: string;
  preferences: MatchingPreferences;
  location?: GeolocationData;
}

// Use descriptive function names
async function findCompatibleMatches(request: UserMatchRequest): Promise<MatchResult[]> {
  // Implementation
}
```

### Error Handling
- Use custom error classes for different error types
- Implement global error handling middleware
- Log errors with appropriate context
- Never expose internal errors to clients

## React Frontend Best Practices

### Component Structure
- Keep components under 200 lines
- Use functional components with hooks
- Implement proper prop typing with TypeScript
- Follow single responsibility principle

### State Management
- Use React hooks for local state
- Implement proper state lifting when needed
- Consider context for shared state
- Avoid prop drilling

### Performance
- Use `React.memo()` for expensive components
- Implement proper key props for lists
- Lazy load components when appropriate
- Optimize bundle size with code splitting

### Accessibility
- Include proper ARIA labels
- Ensure keyboard navigation works
- Maintain proper color contrast
- Test with screen readers

## Security Guidelines

### Data Protection
- Never log sensitive user information (passwords, tokens, personal data)
- Implement proper input sanitization
- Use HTTPS for all communications
- Validate all user inputs on both client and server

### Authentication & Authorization
- Implement proper session management
- Use secure token storage
- Validate permissions on every request
- Implement rate limiting for API endpoints

### Telegram Bot Security
- Validate webhook signatures
- Implement user verification
- Rate limit user interactions
- Sanitize user messages before processing

### Database Security
- Use parameterized queries to prevent SQL injection
- Implement proper access controls
- Encrypt sensitive data at rest
- Regular security audits of database access

## Performance Considerations

### Go Bot Service
- Use connection pooling for database connections
- Implement proper caching strategies
- Use goroutines for concurrent operations
- Monitor memory usage and garbage collection

### TypeScript API
- Implement response caching where appropriate
- Use database indexing for frequent queries
- Optimize JSON serialization
- Monitor API response times

### React Frontend
- Minimize bundle size
- Implement proper image optimization
- Use virtual scrolling for large lists
- Implement proper loading states

## Testing Requirements

### Go Testing
- Write unit tests for all business logic
- Use table-driven tests for multiple scenarios
- Mock external dependencies (Telegram API, database)
- Achieve minimum 80% code coverage

### TypeScript/React Testing
- Write unit tests for utilities and hooks
- Implement integration tests for API endpoints
- Use React Testing Library for component tests
- Achieve minimum 85% code coverage

## Documentation Standards

### Code Comments
- Document public APIs and complex algorithms
- Explain "why" not "what" in comments
- Keep comments up-to-date with code changes
- Use godoc format for Go documentation

### API Documentation
- Document all endpoints with examples
- Include request/response schemas
- Document error conditions
- Provide usage examples

## MeetsMatch-Specific Conventions

### User Privacy
- Always anonymize user data in logs
- Implement proper data retention policies
- Respect user privacy preferences
- Follow GDPR compliance requirements

### Matching Algorithm
- Document matching criteria clearly
- Implement A/B testing for algorithm changes
- Monitor matching success rates
- Provide transparency to users about matching

### Telegram Integration
- Handle all Telegram API rate limits
- Implement graceful degradation for API failures
- Provide clear user feedback for all actions
- Support both individual and group interactions

### Database Schema
- Use consistent naming conventions
- Implement proper foreign key relationships
- Document all table purposes and relationships
- Plan for data migration strategies

## Code Review Checklist

- [ ] Code follows language-specific style guidelines
- [ ] Security considerations are addressed
- [ ] Performance implications are considered
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Error handling is comprehensive
- [ ] User privacy is protected
- [ ] API contracts are maintained
- [ ] Database operations are optimized
- [ ] Telegram bot interactions are user-friendly