"""
Factory for creating AI provider instances
"""
import os
import logging
from typing import Dict, Type
from .base import AIProvider
from . import get_provider

logger = logging.getLogger(__name__)

class AIProviderFactory:
    """Factory for creating AI provider instances"""
    
    @classmethod
    def get_provider(cls, provider_name: str) -> AIProvider:
        """
        Get an AI provider instance
        
        Args:
            provider_name: Name of the provider to get
            
        Returns:
            AIProvider instance
            
        Raises:
            ValueError: If provider not found or required env vars missing
        """
        try:
            provider_class = get_provider(provider_name)
            
            # Check required environment variables
            required_vars = provider_class.get_required_env_vars()
            missing_vars = [var for var in required_vars if not os.getenv(var)]
            if missing_vars:
                raise ValueError(f"Missing required environment variables for {provider_name}: {', '.join(missing_vars)}")
                
            return provider_class()
            
        except Exception as e:
            raise ValueError(f"Failed to get provider '{provider_name}': {str(e)}")
    
    @classmethod
    def get_available_providers(cls) -> list[str]:
        """Get list of available provider names"""
        return ["openai", "anthropic", "stability"] 