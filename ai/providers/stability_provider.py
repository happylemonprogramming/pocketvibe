"""
Stability AI provider implementation
"""
import requests
import base64
import time
import os
import logging
import sys
from pathlib import Path

# Add the root directory to the Python path
root_dir = str(Path(__file__).parent.parent.parent)
if root_dir not in sys.path:
    sys.path.append(root_dir)

from ..base import AIProvider
from PIL import Image
from cloud import serverlink

logger = logging.getLogger(__name__)

class StabilityAIProvider(AIProvider):
    """Stability AI implementation of AIProvider"""
    
    def __init__(self):
        self.api_key = os.getenv("stabilityaiapikey")
        if not self.api_key:
            raise ValueError("stabilityaiapikey environment variable is not set")

    def generate_content(self, prompt: str, **kwargs) -> str:
        """
        Generate content using Stability AI's API
        
        Args:
            prompt: The input prompt
            **kwargs: Additional parameters (not used for Stability AI)
            
        Returns:
            Generated content as string
        """
        raise NotImplementedError("Stability AI does not support text generation")

    def generate_image(self, prompt: str, **kwargs) -> str:
        """Generate an image using Stability AI's API, resize it to 512x512px, and upload to S3"""
        start = time.time()
        
        try:
            # $0.04 per image
            # response = requests.post(
            #     "https://api.stability.ai/v2beta/stable-image/generate/sd3",
            #     headers={
            #         "authorization": f"Bearer {self.api_key}",
            #         "accept": "image/*"
            #     },
            #     files={"none": ''},
            #     data={
            #         "prompt": prompt,
            #         "output_format": "png",
            #         "aspect_ratio": "1:1",
            #         "model": "sd3.5-large-turbo"
            #     },
            # )
            # image_data = response.content

            # # $0.08 per image
            # response = requests.post(
            #     "https://api.stability.ai/v2beta/stable-image/generate/ultra",
            #     headers={
            #         "authorization": f"Bearer {self.api_key}",
            #         "accept": "image/*"
            #     },
            #     files={"none": ''},
            #     data={
            #         "prompt": prompt,
            #         "output_format": "png",
            #         "aspect_ratio": "1:1",
            #     },
            # )
            # image_data = response.content

            # $0.01 per image
            response = requests.post(
                "https://api.stability.ai/v1/generation/stable-diffusion-v1-6/text-to-image",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {self.api_key}"
                },
                json={
                    "text_prompts": [
                        {
                            "text": prompt
                        }
                    ],
                    "height": 512,
                    "width": 512
                },
            )
            base64_image = response.json()["artifacts"][0]["base64"]
            image_data = base64.b64decode(base64_image)

            if response.status_code != 200:
                raise Exception(f"Stability AI API error: {response.json()}")

            # Generate a unique filename using timestamp
            timestamp = int(time.time())
            temp_filename = f"temp_icon_{timestamp}.png"
            temp_filepath = f"./static/icons/{temp_filename}"
            final_filename = f"icon_{timestamp}.png"
            
            # Save the temporary image
            with open(temp_filepath, 'wb') as file:
                file.write(image_data)
            
            # Resize the image to 512x512
            with Image.open(temp_filepath) as img:
                resized_img = img.resize((512, 512), Image.Resampling.LANCZOS)
                resized_img.save(temp_filepath, quality=95)
            
            # Upload to S3
            s3_url = serverlink(temp_filepath, final_filename)
            
            # Clean up the temporary file
            try:
                os.remove(temp_filepath)
            except Exception as e:
                logger.warning(f"Failed to remove temporary file {temp_filepath}: {str(e)}")
            
            logger.info(f"Image generation, resizing, and upload completed in {round(time.time() - start, 2)} seconds")
            
            return s3_url
            
        except Exception as e:
            logger.error(f"Stability AI image generation failed: {str(e)}")
            # Clean up temporary file in case of error
            if 'temp_filepath' in locals():
                try:
                    os.remove(temp_filepath)
                except:
                    pass
            raise
    
    @classmethod
    def get_provider_name(cls) -> str:
        return "stability"
    
    @classmethod
    def get_required_env_vars(cls) -> list[str]:
        return ["stabilityaiapikey"]

# Keep the original function for backward compatibility
def textToImageStability(prompt, siteID):
    provider = StabilityAIProvider()
    return provider.generate_image(prompt)

if __name__ == "__main__":
    # Test the provider
    provider = StabilityAIProvider()
    result = provider.generate_image("a friendly robot in a pocket")
    print(f"Generated image at: {result}")
