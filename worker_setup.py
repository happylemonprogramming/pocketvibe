import os
import dramatiq
from dramatiq_pg import PostgresBroker

DATABASE_URL = os.getenv("DATABASE_URL")
broker = PostgresBroker(url=DATABASE_URL)
dramatiq.set_broker(broker)
