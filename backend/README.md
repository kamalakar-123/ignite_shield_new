# Ignite Shield API Backend

This is the FastAPI backend for the Ignite Shield IoT + Machine Learning project. It uses a pre-trained Random Forest model to predict fire risk levels from sensor readings and stores the results in a PostgreSQL database.

## Prerequisites

- Python 3.9+
- PostgreSQL server

## Setup

1. **Create Database:** 
   Connect to your PostgreSQL instance and create a database named `ignite_shield`:
   ```sql
   CREATE DATABASE ignite_shield;
   ```

2. **Configure Environment:**
   Copy `.env.example` to a new file named `.env` in the `backend/` directory and update the `DATABASE_URL` with your PostgreSQL credentials.
   ```bash
   cp .env.example .env
   ```

3. **Install Dependencies:**
   Ensure you are in the `backend/` directory or project root and have activated your virtual environment.
   ```bash
   pip install -r requirements.txt
   ```

## Running the Application

Start the FastAPI application using Uvicorn:

```bash
uvicorn backend.main:app --reload
```

## API Documentation

- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

## Manual Testing

You can use the Swagger UI to manually test the API.

- `POST /api/v1/predict`: Send sensor JSON data to get a risk prediction and store it in the database.
- `GET /api/v1/readings`: View stored predictions.
- `GET /api/v1/readings/latest`: View the latest prediction.
