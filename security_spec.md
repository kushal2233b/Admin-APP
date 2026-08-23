# Security Specification for WinX7 Admin Portal

## Data Invariants
1. Users must be authenticated to interact with the database.
2. Only authorized admins and staff can create, update, or delete tournaments, banners, and notifications.
3. Users can only read public fields or write their own user profiles.
4. Admin transaction adjustments require valid admin privileges.

## The Dirty Dozen Payloads
1. Unauthenticated write attempt to /tournaments
2. Unauthenticated read attempt to private user data
3. Modifying user role to 'superadmin' without proper authorization
4. Injection of oversized ID strings (>128 chars)
5. Modifying immutable timestamp fields
6. Spoofing ownerId in transactions
7. Creating malicious notification payloads with unvalidated keys
8. Editing closed support tickets without admin access
9. Overwriting platform system settings with unauthenticated writes
10. Injecting negative wallet balances via client-side operations
11. Deleting player accounts without admin rights
12. Creating duplicate transaction entries with tampered IDs
