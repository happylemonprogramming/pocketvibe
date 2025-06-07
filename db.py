from sqlalchemy import create_engine, Column, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from contextlib import contextmanager
import time, os
import logging
from datetime import datetime
import uuid

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
# Create SQLAlchemy engine with connection pooling and retry logic
engine = create_engine(
    DATABASE_URL,
    pool_size=5,  # Number of connections to keep open
    max_overflow=10,  # Maximum number of connections that can be created beyond pool_size
    pool_timeout=30,  # Seconds to wait before giving up on getting a connection from the pool
    pool_recycle=1800,  # Recycle connections after 30 minutes
    pool_pre_ping=True,  # Enable connection health checks
    connect_args={
        'connect_timeout': 10,  # Connection timeout in seconds
        'keepalives': 1,  # Enable TCP keepalive
        'keepalives_idle': 30,  # Seconds between keepalive probes
        'keepalives_interval': 10,  # Seconds between keepalive retries
        'keepalives_count': 5  # Number of keepalive retries
    }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Define database models
class Site(Base):
    __tablename__ = "sites"
    
    id = Column(String, primary_key=True)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default='processing')
    app_name = Column(String)
    icon_url = Column(String)
    subscription_id = Column(String, ForeignKey('push_subscriptions.id'))
    subscription = relationship("PushSubscription", backref="sites")

class Waitlist(Base):
    __tablename__ = "waitlist"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contact = Column(String, nullable=False)
    type = Column(String, nullable=False)  # 'email' or 'npub'
    created_at = Column(DateTime, default=datetime.utcnow)

class CSSGeneration(Base):
    __tablename__ = "css_generations"
    
    id = Column(String, primary_key=True)
    prompt = Column(Text, nullable=False)
    status = Column(String, default='processing')
    css_content = Column(Text)
    error = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class Contact(Base):
    __tablename__ = "contacts"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    contact = Column(String, nullable=True)  # Allow null values
    type = Column(String, nullable=True)  # Allow null values
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    endpoint = Column(String, nullable=False, unique=True)  # The push service endpoint URL
    auth = Column(String, nullable=False)  # Authentication secret
    p256dh = Column(String, nullable=False)  # Public key for encryption
    user_agent = Column(String)  # Browser/device info
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used = Column(DateTime, default=datetime.utcnow)
    is_active = Column(String, default='active')  # 'active' or 'inactive'

    def to_dict(self):
        return {
            'endpoint': self.endpoint,
            'keys': {
                'auth': self.auth,
                'p256dh': self.p256dh
            }
        }

# Create database tables
Base.metadata.create_all(bind=engine)

@contextmanager
def get_db():
    """Get a database session with retry logic"""
    db = SessionLocal()
    max_retries = 3
    retry_delay = 1  # seconds
    
    for attempt in range(max_retries):
        try:
            yield db
            break
        except Exception as e:
            if attempt == max_retries - 1:  # Last attempt
                logger.error(f"Database connection failed after {max_retries} attempts: {str(e)}")
                raise
            logger.warning(f"Database connection attempt {attempt + 1} failed: {str(e)}")
            time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
        finally:
            db.close()

def init_db():
    """Initialize the database schema with retry logic"""
    max_retries = 3
    retry_delay = 1  # seconds
    
    for attempt in range(max_retries):
        try:
            # Tables are created automatically by SQLAlchemy
            logger.info("Database initialized successfully")
            break
        except Exception as e:
            if attempt == max_retries - 1:  # Last attempt
                logger.error(f"Database initialization failed after {max_retries} attempts: {str(e)}")
                raise
            logger.warning(f"Database initialization attempt {attempt + 1} failed: {str(e)}")
            time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
