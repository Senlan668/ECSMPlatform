import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    VOLC_AK = os.getenv("VOLC_ACCESS_KEY")
    VOLC_SK = os.getenv("VOLC_SECRET_KEY")
    ARK_ENDPOINT_ID = os.getenv("ARK_ENDPOINT_ID")
    ARK_API_KEY = os.getenv("ARK_API_KEY")

    RTC_APP_ID = os.getenv("RTC_APP_ID")
    RTC_APP_KEY = os.getenv("RTC_APP_KEY")

    RTC_ASR_APP_ID = os.getenv("RTC_ASR_APP_ID")
    RTC_TTS_APP_ID = os.getenv("RTC_TTS_APP_ID")
    RTC_TTS_CLUSTER = os.getenv("RTC_TTS_CLUSTER", "volcano_tts")
    RTC_TTS_VOICE_TYPE = os.getenv("RTC_TTS_VOICE_TYPE", "BV001_streaming")
    RTC_AGENT_USER_ID = os.getenv("RTC_AGENT_USER_ID", "AiAgent")
    RTC_WELCOME_MESSAGE = os.getenv("RTC_WELCOME_MESSAGE", "您好，我是智能运营助手。")

    KB_COLLECTION_NAME = os.getenv("KB_COLLECTION_NAME", "default")
    KB_PROJECT_NAME = os.getenv("KB_PROJECT_NAME", "default")
    VOLC_ACCOUNT_ID = os.getenv("VOLC_ACCOUNT_ID")

    SERVER_URL = os.getenv("SERVER_URL", "http://127.0.0.1:8103").rstrip("/")
    RUNTIME_CONTROL_TOKEN = os.getenv("RUNTIME_CONTROL_TOKEN", "")
    VOICE_CALLBACK_TOKEN = os.getenv("VOICE_CALLBACK_TOKEN", "")

settings = Config()
