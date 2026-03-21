from cachetools import TTLCache

signal_cache = TTLCache(maxsize=200, ttl=600)  # 10 minutes
