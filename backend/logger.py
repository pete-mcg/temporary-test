import logging
import os
import dotenv

dotenv.load_dotenv()

DEBUG = os.environ.get("DEBUG", "false").lower() == "true"
print(f"DEBUG: {DEBUG}")

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger("app_logger")
