from fastapi import APIRouter

from agent.tool_registry import get_all_tools
from core.permissions import TOOL_PERMISSIONS, check_permission

router = APIRouter()


@router.get("/")
async def list_tools():
    tools = get_all_tools()
    result = []
    for tool in tools:
        name = tool["name"]
        level = check_permission(name)
        result.append({
            "name": name,
            "description": tool["description"],
            "permission_level": int(level),
            "permission_name": level.name,
        })
    return result
