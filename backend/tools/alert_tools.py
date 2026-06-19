from datetime import datetime, timezone


class AlertTools:

    @staticmethod
    async def create_alert(
        name: str,
        condition_type: str,
        condition_config: dict,
        frequency_seconds: int = 300,
        action_type: str = "notify",
        action_config: dict | None = None,
    ) -> str:
        from core.database import AsyncSessionLocal
        from models.alert import Alert

        async with AsyncSessionLocal() as db:
            alert = Alert(
                name=name,
                condition_type=condition_type,
                condition_config=condition_config,
                action_type=action_type,
                action_config=action_config or {},
                frequency_seconds=frequency_seconds,
                is_active=True,
                created_at=datetime.now(timezone.utc),
            )
            db.add(alert)
            await db.commit()
            await db.refresh(alert)

        return (
            f"Alert created successfully.\n"
            f"ID: {alert.id}\n"
            f"Name: {name}\n"
            f"Condition: {condition_type}\n"
            f"Frequency: every {frequency_seconds}s\n"
            f"Action: {action_type}"
        )
