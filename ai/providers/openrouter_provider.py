"""
OpenRouter provider implementation
"""
import os
import logging
import requests
import json
from typing import Optional
from ..base import AIProvider

logger = logging.getLogger(__name__)

class OpenRouterProvider(AIProvider):
    """OpenRouter implementation of AIProvider"""
    
    def __init__(self):
        api_key = os.getenv("openrouterapikey")
        if not api_key:
            raise ValueError("OpenRouter API key not found")
        self.api_key = api_key
        self.base_url = "https://openrouter.ai/api/v1"
    
    def generate_content(self, prompt: str, **kwargs) -> str:
        """
        Generate content using OpenRouter's API
        
        Args:
            prompt: The input prompt
            **kwargs: Additional parameters (model, temperature, etc.)
            
        Returns:
            Generated content as string
        """
        try:
            model = kwargs.get('model', 'anthropic/claude-sonnet-4')
            temperature = kwargs.get('temperature', 0.7)
            max_tokens = kwargs.get('max_tokens', 4000)
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://www.pocketvibe.app/",
                "X-Title": "Pocket Vibe"
            }
            
            data = {
                "model": model,
                "messages": [
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ]
                # "temperature": temperature,
                # "max_tokens": max_tokens
            }
            
            logger.info(f"[OpenRouter] Sending request to model: {model}")
            response = requests.post(
                url=f"{self.base_url}/chat/completions",
                headers=headers,
                json=data,
                timeout=60
            )
            
            if response.status_code != 200:
                logger.error(f"[OpenRouter] API error: {response.status_code} - {response.text}")
                raise Exception(f"OpenRouter API error: {response.status_code}")
            
            response_data = response.json()
            
            if not response_data or 'choices' not in response_data or not response_data['choices']:
                raise Exception("Invalid response format from OpenRouter API")
            
            content = response_data['choices'][0]['message']['content']
            
            # Log usage information if available
            if 'usage' in response_data:
                usage = response_data['usage']
                logger.info(f"[OpenRouter] Usage - Tokens: {usage.get('total_tokens', 'unknown')}")
            
            return content
            
        except requests.exceptions.Timeout:
            logger.error("[OpenRouter] Request timed out")
            raise Exception("OpenRouter API request timed out")
        except requests.exceptions.RequestException as e:
            logger.error(f"[OpenRouter] Request failed: {str(e)}")
            raise Exception(f"OpenRouter API request failed: {str(e)}")
        except Exception as e:
            logger.error(f"[OpenRouter] Content generation failed: {str(e)}")
            raise
    
    def generate_image(self, prompt: str, **kwargs) -> str:
        """
        Generate an image using OpenRouter's image generation
        
        Args:
            prompt: The input prompt
            **kwargs: Additional parameters (size, n, etc.)
            
        Returns:
            URL to the generated image
        """
        try:
            # OpenRouter doesn't have built-in image generation, but we can use Stability AI through it
            # For now, we'll raise an exception and suggest using the Stability provider directly
            raise NotImplementedError(
                "Image generation not directly supported by OpenRouter. "
                "Please use the Stability AI provider for image generation."
            )
            
        except Exception as e:
            logger.error(f"[OpenRouter] Image generation failed: {str(e)}")
            raise
    
    @classmethod
    def get_provider_name(cls) -> str:
        return "openrouter"
    
    @classmethod
    def get_required_env_vars(cls) -> list[str]:
        return ["openrouterapikey"]

if __name__ == "__main__":
    provider = OpenRouterProvider()
    result = provider.generate_content("What is the meaning of life?")
    print(result)
    