"""
JARVIS Twitter Auto-Poster
Posts 30 motivational/insightful tweets per day automatically.
No user confirmation needed — runs fully autonomously.
Uses Groq to generate varied, high-quality content.
"""
import asyncio
import logging
import random
from datetime import datetime, timezone

logger = logging.getLogger("jarvis.twitter")

# Tweet themes for variety
THEMES = [
    "software engineering wisdom",
    "startup and entrepreneurship mindset",
    "productivity and deep work",
    "AI and the future of technology",
    "stoic philosophy for modern life",
    "personal growth and discipline",
    "building great products",
    "mental models for decision making",
    "consistency and long-term thinking",
    "learning fast and shipping faster",
]

TONES = [
    "profound and thought-provoking",
    "punchy and direct, one-liner style",
    "storytelling with a lesson",
    "contrarian and counter-intuitive",
    "motivational and energizing",
    "practical and actionable",
]


async def generate_tweets(count: int = 30) -> list[str]:
    """Generate `count` unique tweets using Groq AI."""
    from core.config import settings
    from groq import AsyncGroq

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    prompt = f"""Generate exactly {count} unique, high-quality tweets for a tech entrepreneur and developer.

Rules:
- Each tweet must be under 250 characters
- No hashtags (they look spammy)
- No emojis — clean, text-only
- Vary the themes: {', '.join(random.sample(THEMES, 5))}
- Vary the tone: mix of {', '.join(random.sample(TONES, 3))}
- Sound like a real person, not a bot
- Some can be questions, some statements, some observations
- Do NOT number them
- Do NOT include quotation marks around them
- Return ONLY the tweets, one per line, nothing else

Today's date: {datetime.now().strftime('%B %d, %Y')}"""

    resp = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.9,
    )

    raw = resp.choices[0].message.content.strip()
    tweets = [line.strip() for line in raw.split('\n') if line.strip() and len(line.strip()) > 20]
    return tweets[:count]


async def post_tweet(text: str) -> dict:
    """Post a single tweet using Twitter API v2."""
    from core.config import settings
    try:
        import tweepy
        client = tweepy.Client(
            consumer_key=settings.TWITTER_API_KEY,
            consumer_secret=settings.TWITTER_API_SECRET,
            access_token=settings.TWITTER_ACCESS_TOKEN,
            access_token_secret=settings.TWITTER_ACCESS_SECRET,
        )
        response = client.create_tweet(text=text)
        tweet_id = response.data['id']
        logger.info("Tweet posted: %s... (ID: %s)", text[:60], tweet_id)
        return {"posted": True, "id": tweet_id, "text": text}
    except Exception as e:
        logger.error("Tweet failed: %s", e)
        return {"posted": False, "error": str(e), "text": text}


# Daily schedule state
_daily_tweets: list[str] = []
_posted_today: list[dict] = []
_last_generated: str = ""


async def run_daily_twitter_session():
    """
    Called by APScheduler.
    Generates 30 tweets in the morning, posts them every ~48 minutes throughout the day.
    """
    from core.config import settings
    if not all([settings.TWITTER_API_KEY, settings.TWITTER_API_SECRET,
                settings.TWITTER_ACCESS_TOKEN, settings.TWITTER_ACCESS_SECRET]):
        logger.warning("Twitter credentials not configured — skipping")
        return

    global _daily_tweets, _posted_today, _last_generated
    today = datetime.now().strftime("%Y-%m-%d")

    if _last_generated != today or not _daily_tweets:
        logger.info("Generating 30 tweets for %s...", today)
        _daily_tweets = await generate_tweets(30)
        _posted_today = []
        _last_generated = today
        logger.info("Generated %d tweets", len(_daily_tweets))

    # Post one tweet per call
    if _daily_tweets:
        tweet = _daily_tweets.pop(0)
        result = await post_tweet(tweet)
        _posted_today.append(result)
        logger.info("Posted tweet %d/30 today", len(_posted_today))

        # Broadcast to dashboard
        from core.websocket_manager import ws_manager
        await ws_manager.broadcast("twitter_post", {
            "text": tweet,
            "posted": result.get("posted"),
            "count_today": len(_posted_today),
            "time": datetime.now(timezone.utc).isoformat(),
        })


def get_twitter_stats() -> dict:
    return {
        "posted_today": len(_posted_today),
        "remaining": len(_daily_tweets),
        "last_posts": _posted_today[-5:],
        "date": _last_generated,
    }
