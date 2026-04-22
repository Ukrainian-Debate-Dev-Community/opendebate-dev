# Migrate to JSON Web Token (JWT) Authentication

## Status

Accepted

## Context

In v1.0, the API utilised a stateless custom header authentication method, requiring clients to pass `x-user-id` in the request headers. While functional for early prototyping, this approach is highly insecure for a production environment. It leaves the API vulnerable to straightforward identity spoofing, as any user could theoretically impersonate an Admin or Owner simply by altering the header ID. To support the complex Role-Based Access Control (RBAC) securely, I needed a cryptographic method to verify user identity.

## Decision

Have migrated the authentication pipeline to use JWT.

- The `userController` (specifically the `login` and `createUser` methods) now signs a payload containing the user's ID with a secret key and returns the token to the client.
- The `authMiddleware` has been completely rewritten. It now extracts the token from the standard `Authorization: Bearer <token>` header, cryptographically verifies the signature, and decodes the payload to attach the secure user object to the request.

## Consequences

- **What becomes easier:** The API is now significantly more secure against spoofing. Backend strictly trusts the decoded token rather than unverified client input. Furthermore, this aligns the API with industry standards, making it much easier to integrate with modern frontend frameworks.
- **What becomes more difficult:** Client applications must now securely store the JWT and append the Bearer token to all restricted outgoing requests. Must also handle token expiration states on the frontend.
