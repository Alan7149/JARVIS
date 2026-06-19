"""
JARVIS Language Learning Mode
- Daily vocabulary sessions (spaced repetition)
- Pronunciation practice via TTS
- Progress tracking
- Voice-driven quiz
"""
import json
import logging
import random
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("jarvis.language")

PROGRESS_FILE = Path(__file__).parent.parent / "data" / "language_progress.json"
PROGRESS_FILE.parent.mkdir(exist_ok=True)

# Built-in vocabulary packs
VOCAB_PACKS = {
    "hindi": [
        ("Namaste", "नमस्ते", "Hello / Greetings"),
        ("Shukriya", "शुक्रिया", "Thank you"),
        ("Haan", "हाँ", "Yes"),
        ("Nahi", "नहीं", "No"),
        ("Paani", "पानी", "Water"),
        ("Khana", "खाना", "Food"),
        ("Ghar", "घर", "Home"),
        ("Kaam", "काम", "Work"),
        ("Dost", "दोस्त", "Friend"),
        ("Pyaar", "प्यार", "Love"),
        ("Subah", "सुबह", "Morning"),
        ("Raat", "रात", "Night"),
        ("Sundar", "सुंदर", "Beautiful"),
        ("Bahut", "बहुत", "Very/Many"),
        ("Aur", "और", "And/More"),
        ("Mera/Meri", "मेरा/मेरी", "My/Mine"),
        ("Kya hal hai", "क्या हाल है", "How are you?"),
        ("Theek hai", "ठीक है", "It's fine/OK"),
        ("Kahan", "कहाँ", "Where"),
        ("Kab", "कब", "When"),
    ],
    "spanish": [
        ("Hola", "hello", "Hello"),
        ("Gracias", "thank you", "Thank you"),
        ("Por favor", "please", "Please"),
        ("Buenos días", "good morning", "Good morning"),
        ("Buenas noches", "good night", "Good night"),
        ("Cómo estás", "how are you", "How are you?"),
        ("Muy bien", "very well", "Very well"),
        ("Agua", "water", "Water"),
        ("Casa", "house/home", "House/Home"),
        ("Trabajo", "work/job", "Work/Job"),
    ],
    "japanese": [
        ("Konnichiwa", "こんにちは", "Hello"),
        ("Arigatou", "ありがとう", "Thank you"),
        ("Hai", "はい", "Yes"),
        ("Iie", "いいえ", "No"),
        ("Mizu", "水", "Water"),
        ("Taberu", "食べる", "To eat"),
        ("Tomodachi", "友達", "Friend"),
        ("Kawaii", "可愛い", "Cute/Adorable"),
        ("Sugoi", "すごい", "Amazing/Wow"),
        ("Oyasumi", "おやすみ", "Good night"),
    ],
}

LEARN_STATE = {
    "active_language": "hindi",
    "session_active": False,
    "daily_goal": 5,
    "progress": {},
}


def _load_progress() -> dict:
    try:
        if PROGRESS_FILE.exists():
            return json.loads(PROGRESS_FILE.read_text())
    except Exception:
        pass
    return {}


def _save_progress(progress: dict):
    try:
        PROGRESS_FILE.write_text(json.dumps(progress, indent=2, ensure_ascii=False))
    except Exception:
        pass


async def run_daily_session(language: str = "hindi", words: int = 5) -> dict:
    """Run a vocabulary session — teaches N words, quizzes on previous ones."""
    from voice.wake_word import _speak

    progress = _load_progress()
    lang_progress = progress.get(language, {})
    vocab = VOCAB_PACKS.get(language, [])

    if not vocab:
        return {"error": f"No vocabulary pack for '{language}'. Available: {list(VOCAB_PACKS.keys())}"}

    LEARN_STATE["session_active"] = True
    LEARN_STATE["active_language"] = language

    # Pick words: prioritize ones with low scores
    def word_score(w):
        return lang_progress.get(w[0], {}).get("score", 0)

    sorted_vocab = sorted(vocab, key=word_score)
    session_words = sorted_vocab[:words]

    results = []
    _speak(f"Starting your {language.capitalize()} lesson. {words} words today.")

    for romanized, native, meaning in session_words:
        entry = {"word": romanized, "native": native, "meaning": meaning}

        # Teach
        _speak(f"{romanized} means {meaning}. {romanized}.")
        import time; time.sleep(1.5)

        # Update progress
        word_data = lang_progress.get(romanized, {"score": 0, "seen": 0, "last": ""})
        word_data["seen"] = word_data.get("seen", 0) + 1
        word_data["last"] = datetime.now().isoformat()
        word_data["score"] = min(10, word_data.get("score", 0) + 1)
        lang_progress[romanized] = word_data
        results.append(entry)

    progress[language] = lang_progress
    _save_progress(progress)

    total_learned = len([v for v in lang_progress.values() if v.get("score", 0) >= 3])
    _speak(f"Great session! You've now learned {total_learned} {language.capitalize()} words. Keep it up!")

    LEARN_STATE["session_active"] = False
    return {
        "language": language,
        "words_taught": results,
        "total_learned": total_learned,
        "session_complete": True,
    }


async def quiz(language: str = "hindi", count: int = 3) -> dict:
    """Quick quiz on previously learned words."""
    from voice.wake_word import _speak

    progress = _load_progress()
    lang_progress = progress.get(language, {})
    vocab = VOCAB_PACKS.get(language, [])

    learned = [w for w in vocab if lang_progress.get(w[0], {}).get("score", 0) >= 2]
    if len(learned) < 2:
        return {"error": "Not enough words learned yet. Do a daily session first."}

    quiz_words = random.sample(learned, min(count, len(learned)))
    _speak(f"Quiz time! I'll say the meaning, you think of the {language.capitalize()} word.")

    score = 0
    for romanized, native, meaning in quiz_words:
        _speak(f"What is '{meaning}' in {language.capitalize()}?")
        import time; time.sleep(3)
        _speak(f"The answer is: {romanized}.")
        score += 1

    _speak(f"Quiz complete! Remember these words for tomorrow.")
    return {"quiz_words": [{"word": w[0], "meaning": w[2]} for w in quiz_words], "count": len(quiz_words)}


def get_stats(language: str = None) -> dict:
    progress = _load_progress()
    if language:
        lp = progress.get(language, {})
        total = len(VOCAB_PACKS.get(language, []))
        learned = len([v for v in lp.values() if v.get("score", 0) >= 3])
        return {"language": language, "learned": learned, "total": total, "pct": round(learned/max(total,1)*100)}
    return {
        lang: {
            "learned": len([v for v in progress.get(lang, {}).values() if v.get("score", 0) >= 3]),
            "total": len(VOCAB_PACKS.get(lang, [])),
        }
        for lang in VOCAB_PACKS
    }
