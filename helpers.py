import os
import re
import time
import requests
import logging
from PIL import Image
from io import BytesIO
from ai.factory import AIProviderFactory
from cloud import serverlink
from db import get_db, Site

logger = logging.getLogger(__name__)

# PWA Support
def inject_pwa_support(html_content, site_id):
    """
    Injects PWA support into generated websites
    Adds:
    - Manifest link
    - Service worker registration
    - Meta tags for PWA support
    """
    pwa_elements = f"""
    <link rel="manifest" href="/site/{site_id}/manifest.json">
    <meta name="theme-color" content="#121212"/>
    <meta name="description" content="Made with PocketVibe"/>
    <meta name="mobile-web-app-capable" content="yes">
    <link rel="apple-touch-icon" href="/static/icons/pocketvibe.png" type="image/png">
    
    <script>
      if ('serviceWorker' in navigator) {{
        window.addEventListener('load', () => {{
          navigator.serviceWorker.register('/site/{site_id}/sw.js')
            .then(reg => console.log('Service worker registered'))
            .catch(err => console.log('Service worker registration failed', err));
        }});
      }}
    </script>
    """
    
    if "</head>" in html_content.lower():
        return html_content.replace("</head>", pwa_elements + "</head>", 1)
    else:
        return f"<!DOCTYPE html><html><head>{pwa_elements}</head>{html_content}</html>"
    

# Remove '''html''' from the beginning and end of the text
def strip_code_block(text):
    match = re.match(r"```(?:\w+)?\n(.+?)\n```", text, re.DOTALL)
    return match.group(1) if match else text

# Function to call the AI service
def call_ai_service(prompt):
    """
    Generates website content using the configured AI provider
    Args:
        prompt: User's description of the desired website
    Returns:
        Generated HTML content
    """
    start_time = time.time()
    logger.info(f"[AI Request] Starting AI request with prompt length: {len(prompt)}")
    
    try:
        # Get the configured provider
        provider_name = os.getenv("AI_PROVIDER", "openai")
        provider = AIProviderFactory.get_provider(provider_name)
        
        logger.info(f"[AI Request] Using provider: {provider_name}")
        logger.info("[AI Request] Sending request to AI API")
        api_start_time = time.time()
        
        # Read the prompt template from the text file
        try:
            with open('site_prompt.txt', 'r', encoding='utf-8') as f:
                prompt_template = f.read()
        except FileNotFoundError:
            logger.warning("[AI Request] site_prompt.txt not found, using fallback prompt")
            prompt_template = """You are a LEGENDARY webapp builder. 
Reply with complete web code only. 
Do not explain yourself, respond with code only.
Create a complete, valid using only HTML, CSS and Javascript.
Only use photos when specifically needed for content (portfolio, gallery, product images).
For icons and simple graphics, use embedded base64 SVG or Unicode symbols.
Build mobile-first with relative units to work on all screen sizes.

Here is the webapp description: 
{prompt}"""
        
        # Prepare the full prompt by replacing the placeholder
        full_prompt = prompt_template.format(prompt=prompt)
        
        # Generate content using the provider
        result = provider.generate_content(full_prompt)
        
        api_duration = time.time() - api_start_time
        logger.info(f"[AI Response] Received response from {provider_name} API in {api_duration:.2f} seconds")

        total_duration = time.time() - start_time
        logger.info(f"[AI Complete] Total AI processing completed in {total_duration:.2f} seconds")
        return strip_code_block(result)
    
    except Exception as e:
        total_duration = time.time() - start_time
        logger.error(f"[AI Error] Failed after {total_duration:.2f} seconds: {str(e)}")
        raise Exception(f"Failed to generate content: {str(e)}")


# App icon helper function
def download_and_resize_image(image_url, app_name):
    """
    Downloads and processes images for app icons
    Features:
    - Streams image download
    - Resizes to 512x512
    - Optimizes image quality
    - Handles transparency
    """
    ICONS_DIR = "static/icons"
    try:
        response = requests.get(image_url, timeout=10, stream=True)
        response.raise_for_status()
        
        image_data = BytesIO()
        for chunk in response.iter_content(chunk_size=8192):
            image_data.write(chunk)
        image_data.seek(0)
        
        img = Image.open(image_data)
        
        if img.mode in ('RGBA', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            img = background
        
        if img.size[0] > 512 or img.size[1] > 512:
            ratio = min(512/img.size[0], 512/img.size[1])
            new_size = tuple(int(dim * ratio) for dim in img.size)
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        new_img = Image.new('RGB', (512, 512), (255, 255, 255))
        offset = ((512 - img.size[0]) // 2, (512 - img.size[1]) // 2)
        new_img.paste(img, offset)
        
        filename = f"{app_name}.png"
        filepath = os.path.join(ICONS_DIR, filename)
        
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        new_img.save(filepath, 'PNG', optimize=True, quality=85)
        
        try:
            # url, _ = urlgenerator(filepath, app_name, alt="App Icon", MIME="image/png")
            url = serverlink(filepath, filename)
            return url
        except Exception as e:
            logger.error(f"Error generating URL: {str(e)}")
            raise Exception(f"Error generating URL: {str(e)}")
        finally:
            # Clean up the temporary file
            try:
                os.remove(filepath)
            except Exception as e:
                logger.error(f"Error deleting temporary file: {str(e)}")
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        raise Exception(f"Failed to process image: {str(e)}")

def get_custom_icon_url(site_id):
    """Check if a custom icon URL exists for the site and return it"""
    with get_db() as db:
        site = db.query(Site).filter(Site.id == site_id).first()
        if site and site.icon_url:
            return site.icon_url
    return None

if __name__ == "__main__":
    prompt = "A website for a small business that sells handmade jewelry"
    response = call_ai_service(prompt)
    print(response)
