# Pull Request Template

## Description

Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes, no api changes)

## Checklist

### Code Quality

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation

### HTTP Response Patterns

- [ ] All endpoints use `src/utils/http-response.ts` utilities
- [ ] No direct `res.json()` or `res.status().json()` calls in controllers/routes
- [ ] SSE endpoints correctly use `res.write()` for streaming
- [ ] Error handling uses `handleErrorWithAutoDetection()` or typed `AppError`

### Testing

- [ ] Tests added/updated for new functionality
- [ ] All existing tests pass
- [ ] Run `npm run test` successfully

### Build

- [ ] No new lint errors
- [ ] Run `npm run build` completes successfully
- [ ] TypeScript compilation passes

### Error Handling

- [ ] No empty catch blocks
- [ ] Errors are properly logged using logger
- [ ] No `as any`, `@ts-ignore`, or `@ts-expect-error` type assertions

## Related Issue

Fixes #

## Additional Context

Add any other context or screenshots about the problem here.
