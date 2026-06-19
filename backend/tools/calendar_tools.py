"""Google Calendar & Gmail integration tools."""
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("jarvis.tools.calendar")


class CalendarTools:

    @staticmethod
    async def get_calendar_events(days_ahead: int = 7, max_results: int = 20) -> dict[str, Any]:
        """Get upcoming Google Calendar events."""
        from core.config import settings
        if not settings.GOOGLE_CREDENTIALS_FILE:
            return {"error": "Google Calendar not configured. Add GOOGLE_CREDENTIALS_FILE to .env"}
        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            import os, json, pickle

            SCOPES = ['https://www.googleapis.com/auth/calendar.readonly',
                      'https://www.googleapis.com/auth/gmail.readonly']
            token_file = 'google_token.pickle'
            creds = None

            if os.path.exists(token_file):
                with open(token_file, 'rb') as f:
                    creds = pickle.load(f)

            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(settings.GOOGLE_CREDENTIALS_FILE, SCOPES)
                    creds = flow.run_local_server(port=0)
                with open(token_file, 'wb') as f:
                    pickle.dump(creds, f)

            service = build('calendar', 'v3', credentials=creds)
            now = datetime.now(timezone.utc).isoformat()
            from datetime import timedelta
            future = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat()

            events_result = service.events().list(
                calendarId='primary', timeMin=now, timeMax=future,
                maxResults=max_results, singleEvents=True, orderBy='startTime'
            ).execute()

            events = events_result.get('items', [])
            return {
                "events": [
                    {
                        "title": e.get('summary', 'Untitled'),
                        "start": e['start'].get('dateTime', e['start'].get('date')),
                        "end": e['end'].get('dateTime', e['end'].get('date')),
                        "location": e.get('location', ''),
                        "description": e.get('description', '')[:200] if e.get('description') else '',
                    }
                    for e in events
                ],
                "count": len(events),
                "days_ahead": days_ahead,
            }
        except Exception as e:
            logger.error("Calendar fetch failed: %s", e)
            return {"error": str(e)}

    @staticmethod
    async def get_gmail_inbox(max_results: int = 10, query: str = "is:unread") -> dict[str, Any]:
        """Get Gmail messages."""
        from core.config import settings
        if not settings.GOOGLE_CREDENTIALS_FILE:
            return {"error": "Gmail not configured. Add GOOGLE_CREDENTIALS_FILE to .env"}
        try:
            from google.oauth2.credentials import Credentials
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            import pickle, os, base64

            token_file = 'google_token.pickle'
            creds = None
            if os.path.exists(token_file):
                with open(token_file, 'rb') as f:
                    creds = pickle.load(f)
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    return {"error": "Google auth required. Run setup first."}

            service = build('gmail', 'v1', credentials=creds)
            results = service.users().messages().list(
                userId='me', q=query, maxResults=max_results
            ).execute()

            messages = []
            for msg in results.get('messages', []):
                msg_data = service.users().messages().get(
                    userId='me', id=msg['id'], format='metadata',
                    metadataHeaders=['From', 'Subject', 'Date']
                ).execute()
                headers = {h['name']: h['value'] for h in msg_data['payload']['headers']}
                messages.append({
                    "id": msg['id'],
                    "from": headers.get('From', ''),
                    "subject": headers.get('Subject', ''),
                    "date": headers.get('Date', ''),
                    "snippet": msg_data.get('snippet', ''),
                })

            return {"messages": messages, "count": len(messages), "query": query}
        except Exception as e:
            logger.error("Gmail fetch failed: %s", e)
            return {"error": str(e)}

    @staticmethod
    async def send_gmail(to: str, subject: str, body: str) -> dict[str, Any]:
        """Send an email via Gmail."""
        from core.config import settings
        if not settings.GOOGLE_CREDENTIALS_FILE:
            return {"error": "Gmail not configured."}
        try:
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            import pickle, os, base64
            from email.mime.text import MIMEText

            token_file = 'google_token.pickle'
            with open(token_file, 'rb') as f:
                creds = pickle.load(f)
            if creds.expired:
                creds.refresh(Request())

            service = build('gmail', 'v1', credentials=creds)
            message = MIMEText(body)
            message['to'] = to
            message['subject'] = subject
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
            service.users().messages().send(userId='me', body={'raw': raw}).execute()
            return {"sent": True, "to": to, "subject": subject}
        except Exception as e:
            return {"error": str(e)}
