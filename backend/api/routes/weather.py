from fastapi import APIRouter
from tools.search_tools import SearchTools

router = APIRouter()


@router.get("/current")
async def get_current_weather(location: str = "auto"):
    return await SearchTools.get_weather(location)
