# Debate Management API

RESTful API built with Node.js and Express to manage debate clubs, tournaments, dynamic matchmaking, and speaker statistics.

## Features

- **Role-Based Access Control (RBAC):** Custom, highly secure middleware handling Admins, Holding (Tournament/Club) Owners, Judges, and standard Debaters.
- **Dynamic Matchmaking Pipeline:** Waitlist registration and team formation. Transactional room generation.
- **Tournament Integrity:** Backend redaction logic securely hiding debate motions from standard users until officially released.
- **Tabulation & Scoring:** Secure ballot submission system with data integrity checks and locked states for finished rooms.
- **Statistical Engine:** Native SQL aggregation to generate granular user dashboards (win rates, positional mastery, partner synergy).
- **Soft Deletion:** Safe data archiving to preserve historical tournament records without breaking foreign key constraints.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MS SQL Server
- **ORM:** Sequelize
- **Security:** bcryptjs (password hashing), JSON Web Tokens (JWT) for secure authentication.

## Local Setup & Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Ukrainian-Debate-Dev-Community/opendebate-dev.git
   cd opendebate-dev
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Environment Configuration:**
   Create a `.env` file in the root directory and add your MS SQL database credentials:

   ```env
   PORT = 3000
   DB_SERVER = Server_name
   DB_USER = user
   DB_PASSWORD = password
   DB_DATABASE = DB_name
   NODE_ENV = development
   JWT_SECRET = secret_string
   JWT_EXPIRES_IN = 1d
   ```

4. **Database Setup**

   ```bash
   npx sequelize-cli db:migrate
   npx sequelize-cli db:seed:all
   ```

5. **Start the Development Server:**
   ```bash
   npm run dev
   ```

## Authentication

The API utilises JSON Web Tokens (JWT) for stateless, secure authentication.
For all protected routes, you must include your token in the request headers:

- `Authorization: Bearer <your_jwt_token_here>`

## API Documentation

A full Postman collection containing all available endpoints, request bodies, and parameters is included in this repository.

- Navigate to the `postman/` folder and import the `debates.postman_collection.json` file into Postman.
  > Note: The collection is configured to automatically capture and apply the JWT Bearer token globally upon a successful login request.

### Core Domain Routes

- `/api/users` - User registration, authentication, profile management, and statistics.
- `/api/holdings` - Management of workspaces (Academic Clubs or Personal Tournament spaces) and their Owners.
- `/api/sessions` - Management of time-blocks (Evenings Meeting or Tournament Rounds).
- `/api/sessions/:sessionId/*` - Nested routers handling domain-specific logic for `teams`, `waitlists`, `rooms`, and `motion`.
- `/api/admins/grant` - Simple route to grant Administrator status to another user.
