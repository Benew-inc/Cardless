# Cardless Cash Withdrawal System

A production-ready full-stack application for a cardless cash withdrawal system.

## Tech Stack

- **Backend:** Node.js, Fastify, PostgreSQL, Redis
- **Frontend:** React, Vite
- **Infrastructure:** Docker, Docker Compose

## Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone <repository_url>
cd Cardless
```

### 2. Environment Variables

Navigate to the `backend` folder and copy the example environment file:

```bash
cd backend
cp .env.example .env
```

Update `.env` with your configuration if necessary.

### 3. Run with Docker (Recommended)

From the root directory:

```bash
docker-compose up --build
```

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3000
- **Backend Health Check:** http://localhost:3000/health

### 4. Run Locally (Development)

**Backend:**

```bash
cd backend
npm install
npm run dev
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

- `/backend`: Fastify API server
- `/frontend`: React application
- `docker-compose.yml`: Service orchestration

## Testing

(To be implemented)
