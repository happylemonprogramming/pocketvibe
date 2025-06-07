"""
OpenAI provider implementation
"""
import os
import logging
from typing import Optional
from openai import OpenAI
from ..base import AIProvider

logger = logging.getLogger(__name__)

class OpenAIProvider(AIProvider):
    """OpenAI implementation of AIProvider"""
    
    def __init__(self):
        api_key = os.getenv("chatgptapikey")
        if not api_key:
            raise ValueError("OpenAI API key not found")
        self.client = OpenAI(api_key=api_key)
    
    def generate_content(self, prompt: str, **kwargs) -> str:
        """
        Generate content using OpenAI's API
        
        Args:
            prompt: The input prompt
            **kwargs: Additional parameters (model, temperature, etc.)
            
        Returns:
            Generated content as string
        """
        try:
            model = kwargs.get('model', 'gpt-4.1') #gpt-4o-mini
            response = self.client.responses.create(
                model=model,
                input=prompt
            )
            
            if not response or not response.output or not response.output[0].content:
                raise Exception("Invalid response format from OpenAI API")
                
            return response.output[0].content[0].text
            
        except Exception as e:
            logger.error(f"OpenAI content generation failed: {str(e)}")
            raise
    
    def generate_image(self, prompt: str, **kwargs) -> str:
        """
        Generate an image using DALL-E
        
        Args:
            prompt: The input prompt
            **kwargs: Additional parameters (size, n, etc.)
            
        Returns:
            URL to the generated image
        """
        try:
            size = kwargs.get('size', '512x512')
            n = kwargs.get('n', 1)
            
            result = self.client.images.generate(
                model="dall-e-2",
                prompt=prompt,
                size=size,
                n=n
            )
            
            if not result.data:
                raise Exception("No image was generated")
                
            return result.data[0].url
            
        except Exception as e:
            logger.error(f"OpenAI image generation failed: {str(e)}")
            raise
    
    @classmethod
    def get_provider_name(cls) -> str:
        return "openai"
    
    @classmethod
    def get_required_env_vars(cls) -> list[str]:
        return ["chatgptapikey"] 
    
if __name__ == "__main__":
    provider = OpenAIProvider()
    result = provider.generate_image("a friendly robot in a pocket")
    print(f"Generated image at: {result}")
