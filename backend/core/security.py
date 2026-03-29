import os
from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())


API_KEY = os.getenv("MASTER_API_KEY")
if not API_KEY:
    raise ValueError("FATAL ERROR: MASTER_API_KEY is missing in your .env file!")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):

    if api_key == API_KEY:
        return api_key
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="403 Forbidden No Auth.",
    )