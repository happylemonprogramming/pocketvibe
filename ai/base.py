"""
Base interface for AI providers
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

class AIProvider(ABC):
    """Base class for AI providers"""
    
    @abstractmethod
    def generate_content(self, prompt: str, **kwargs) -> str:
        """
        Generate content based on the prompt
        
        Args:
            prompt: The input prompt
            **kwargs: Additional provider-specific parameters
            
        Returns:
            Generated content as string
        """
        pass
    
    @abstractmethod
    def generate_image(self, prompt: str, **kwargs) -> str:
        """
        Generate an image based on the prompt
        
        Args:
            prompt: The input prompt
            **kwargs: Additional provider-specific parameters
            
        Returns:
            URL or path to the generated image
        """
        pass
    
    @classmethod
    @abstractmethod
    def get_provider_name(cls) -> str:
        """Get the name of the provider"""
        pass
    
    @classmethod
    @abstractmethod
    def get_required_env_vars(cls) -> list[str]:
        """Get list of required environment variables"""
        pass 