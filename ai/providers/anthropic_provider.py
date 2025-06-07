"""
Anthropic (Claude) provider implementation
"""
import os
import logging
from typing import Optional
from ..base import AIProvider
import anthropic

logger = logging.getLogger(__name__)

class AnthropicProvider(AIProvider):
    """Anthropic implementation of AIProvider"""
    
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("Anthropic API key not found")
        # Initialize Anthropic client here when implemented
        # self.client = Anthropic(api_key=api_key)
    
    def generate_content(self, prompt: str, **kwargs) -> str:
        """
        Generate content using Anthropic's API
        
        Args:
            prompt: The input prompt
            
        Returns:
            Generated content as string
        """
        try:
            client = anthropic.Anthropic(
                # defaults to os.environ.get("ANTHROPIC_API_KEY")
                api_key=os.getenv("ANTHROPIC_API_KEY"),
            )
            message = client.messages.create(
                model="claude-opus-4-20250514",
                max_tokens=10240,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            logger.info(f"API Response: {message}")
            return message.content[0].text
        except Exception as e:
            logger.error(f"Anthropic content generation failed: {str(e)}")
            raise
    
    def generate_image(self, prompt: str, **kwargs) -> str:
        """
        Generate an image using Anthropic's API
        
        Args:
            prompt: The input prompt
            **kwargs: Additional parameters (size, n, etc.)
            
        Returns:
            URL to the generated image
        """
        # TODO: Implement Anthropic image generation if available
        raise NotImplementedError("Anthropic image generation not yet implemented")
    
    @classmethod
    def get_provider_name(cls) -> str:
        return "anthropic"
    
    @classmethod
    def get_required_env_vars(cls) -> list[str]:
        return ["ANTHROPIC_API_KEY"]
    
if __name__ == "__main__":
    prompt = "build a website for a small business that sells handmade jewelry"
    full_prompt = """
    You are an expert website generator. 
    Only reply with complete website code based on user descriptions. 
    Do not explain anything. 
    Create a complete, valid HTML document with embedded CSS and JavaScript based on the user's description. 
    Prioritize CSS-based visuals for modern design:
    - Use CSS gradients, shapes, and patterns for visual interest
    - Create abstract geometric backgrounds and card layouts with CSS
    - Build hero sections and visual hierarchy using CSS styling
    - Only use photos when specifically needed for content (portfolio, gallery, product images)
    For images when necessary, use https://picsum.photos/seed/KEYWORD/WIDTH/HEIGHT with relevant keywords.
    For icons and simple graphics, use embedded base64 SVG data or Unicode symbols.
    Follow mobile-first responsive design with proper breakpoints:
    - Design for mobile (320px+) first 
    - Add tablet styles using @media (min-width: 768px)
    - Add desktop styles using @media (min-width: 1024px)
    - Use relative units (rem, em, %, vw, vh) and fluid layouts
    - Ensure content scales smoothly between breakpoints
    Use modern CSS features (flexbox, grid, custom properties) with cross-browser compatibility.
    Make layouts flexible and adaptive across all screen sizes while prioritizing mobile experience.
    Here is the user's description: """ + prompt
    provider = AnthropicProvider()
    result = provider.generate_content(full_prompt)
    # Write result to file
    with open('anthropic_response.txt', 'w', encoding='utf-8') as f:
        f.write(result)
    print("Response written to anthropic_response.txt")