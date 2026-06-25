"""
Generate Apple Shortcut (.shortcut) files programmatically.
These open in iOS Shortcuts app ready to add with one tap.
"""
import io
import plistlib
import uuid
from pathlib import Path

from core.config import settings

# Configure these in backend/.env (TAILSCALE_IP, LOCAL_IP, API_KEY)
TAILSCALE_IP = settings.TAILSCALE_IP or "YOUR_TAILSCALE_IP"
LOCAL_IP = settings.LOCAL_IP or "YOUR_LOCAL_IP"
JARVIS_IP = TAILSCALE_IP  # Primary — Tailscale works everywhere
API_KEY = settings.API_KEY
WEBHOOK = f"http://{JARVIS_IP}:8000/api/webhooks/phone"
WEBHOOK_LOCAL = f"http://{LOCAL_IP}:8000/api/webhooks/phone"

OUTPUT_DIR = Path(__file__).parent.parent / "static" / "shortcuts"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _text_token(text: str) -> dict:
    """A plain text token."""
    return {"Value": {"string": text}, "WFSerializationType": "WFTextTokenString"}


def _var_token(output_name: str, output_uuid: str) -> dict:
    """A variable reference token."""
    return {
        "Value": {
            "attachmentsByRange": {
                "{0, 1}": {
                    "OutputName": output_name,
                    "OutputUUID": output_uuid,
                    "Type": "ActionOutput",
                }
            },
            "string": "￼",
        },
        "WFSerializationType": "WFTextTokenString",
    }


def _dict_field(key: str, value_token: dict) -> dict:
    return {
        "WFItemType": 0,
        "WFKey": _text_token(key),
        "WFValue": value_token,
    }


def build_jarvis_shortcut(
    name: str,
    event_type: str,
    command_text: str | None = None,   # None = use Dictate/Ask
    use_dictation: bool = True,
) -> bytes:
    """Build a complete JARVIS shortcut file."""
    actions = []
    input_uuid = str(uuid.uuid4()).upper()
    dl_uuid = str(uuid.uuid4()).upper()

    # ── Step 1: Capture input ─────────────────────────────────────────────────
    if command_text:
        # Fixed text command (for automations like Battery Alert)
        actions.append({
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": input_uuid,
                "WFTextActionText": _text_token(command_text),
                "CustomOutputName": "Command",
            },
        })
    elif use_dictation:
        # Dictate text (voice input)
        actions.append({
            "WFWorkflowActionIdentifier": "is.workflow.actions.dictatetext",
            "WFWorkflowActionParameters": {
                "UUID": input_uuid,
                "WFSpeakTextLanguage": "en-US",
                "CustomOutputName": "Command",
            },
        })
    else:
        # Ask for text input
        actions.append({
            "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
            "WFWorkflowActionParameters": {
                "UUID": input_uuid,
                "WFInputType": "Text",
                "WFAskActionPrompt": _text_token("Ask JARVIS:"),
                "CustomOutputName": "Command",
            },
        })

    # ── Step 2: Build JSON body via Text action ────────────────────────────────
    json_uuid = str(uuid.uuid4()).upper()
    # Build JSON string with variable interpolation
    json_body = {
        "Value": {
            "attachmentsByRange": {
                "{47, 1}": {
                    "OutputName": "Command",
                    "OutputUUID": input_uuid,
                    "Type": "ActionOutput",
                }
            },
            "string": f'{{"device_name":"iPhone-13","event_type":"{event_type}","command":"￼"}}',
        },
        "WFSerializationType": "WFTextTokenString",
    }
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": json_uuid,
            "WFTextActionText": json_body,
            "CustomOutputName": "JSON Body",
        },
    })

    # ── Step 3: URL ────────────────────────────────────────────────────────────
    url_uuid = str(uuid.uuid4()).upper()
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.url",
        "WFWorkflowActionParameters": {
            "UUID": url_uuid,
            "WFURLActionURL": WEBHOOK,
            "CustomOutputName": "JARVIS URL",
        },
    })

    # ── Step 4: Get Contents of URL (POST) ────────────────────────────────────
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": dl_uuid,
            "WFHTTPMethod": "POST",
            "WFHTTPHeaders": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        _dict_field("X-API-Key", _text_token(API_KEY)),
                        _dict_field("Content-Type", _text_token("application/json")),
                    ]
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
            "WFHTTPBodyType": "File",
            "WFRequestBodyLocation": {
                "Value": {
                    "OutputName": "JSON Body",
                    "OutputUUID": json_uuid,
                    "Type": "ActionOutput",
                },
                "WFSerializationType": "WFTextTokenAttachment",
            },
            "CustomOutputName": "JARVIS Response",
        },
    })

    # ── Step 5: Get response text ─────────────────────────────────────────────
    response_uuid = str(uuid.uuid4()).upper()
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
        "WFWorkflowActionParameters": {
            "UUID": response_uuid,
            "WFDictionaryKey": _text_token("response"),
            "WFInput": {
                "Value": {
                    "OutputName": "JARVIS Response",
                    "OutputUUID": dl_uuid,
                    "Type": "ActionOutput",
                },
                "WFSerializationType": "WFTextTokenAttachment",
            },
            "CustomOutputName": "JARVIS Text",
        },
    })

    # ── Step 6: Speak the response ────────────────────────────────────────────
    actions.append({
        "WFWorkflowActionIdentifier": "is.workflow.actions.speaktext",
        "WFWorkflowActionParameters": {
            "WFSpeakTextLanguage": "en-US",
            "WFSpeakTextRate": 0.5,
            "WFSpeakTextWait": True,
            "WFSpeakTextPitch": 1.0,
        },
    })

    shortcut = {
        "WFWorkflowClientVersion": "1260.0.1",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowHasShortcutInputVariables": False,
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowActions": actions,
        "WFWorkflowTypes": [],
        "WFWorkflowOutputContentItemClasses": [],
    }

    buf = io.BytesIO()
    plistlib.dump(shortcut, buf, fmt=plistlib.FMT_XML)
    return buf.getvalue()


# Pre-built shortcuts config
SHORTCUTS_CONFIG = [
    {
        "id": "hey-jarvis",
        "name": "Hey JARVIS",
        "emoji": "🎙️",
        "desc": "Voice command via Siri",
        "siri_phrase": "Hey JARVIS",
        "event_type": "voice_command",
        "use_dictation": True,
        "command_text": None,
    },
    {
        "id": "battery-alert",
        "name": "JARVIS Battery Alert",
        "emoji": "🔋",
        "desc": "Automation: Battery below 20%",
        "siri_phrase": None,
        "event_type": "battery_low",
        "use_dictation": False,
        "command_text": "iPhone battery is critically low",
    },
    {
        "id": "arrived-home",
        "name": "JARVIS Arrived Home",
        "emoji": "🏠",
        "desc": "Automation: Arrive at Home",
        "siri_phrase": None,
        "event_type": "location",
        "use_dictation": False,
        "command_text": "I just arrived home, give me a welcome briefing",
    },
    {
        "id": "morning-briefing",
        "name": "JARVIS Morning",
        "emoji": "☀️",
        "desc": "Automation: 9:00 AM daily",
        "siri_phrase": None,
        "event_type": "voice_command",
        "use_dictation": False,
        "command_text": "Give me my morning briefing with weather and schedule",
    },
    {
        "id": "goodnight",
        "name": "JARVIS Goodnight",
        "emoji": "🌙",
        "desc": "Automation: Bedtime / 11 PM",
        "siri_phrase": "JARVIS goodnight",
        "event_type": "voice_command",
        "use_dictation": False,
        "command_text": "Activate bedside mode and set alarm for 7:30 AM",
    },
    {
        "id": "driving-mode",
        "name": "JARVIS Driving",
        "emoji": "🚗",
        "desc": "Automation: CarPlay connects",
        "siri_phrase": None,
        "event_type": "status",
        "use_dictation": False,
        "command_text": "Driving mode activated, brief me on traffic and notifications",
    },
]


def generate_all():
    """Generate all shortcut files and save to static/shortcuts/"""
    results = []
    for sc in SHORTCUTS_CONFIG:
        data = build_jarvis_shortcut(
            name=sc["name"],
            event_type=sc["event_type"],
            command_text=sc.get("command_text"),
            use_dictation=sc.get("use_dictation", False),
        )
        filename = f"{sc['id']}.shortcut"
        path = OUTPUT_DIR / filename
        path.write_bytes(data)
        results.append({"id": sc["id"], "name": sc["name"], "file": filename, "size": len(data)})
    return results
