import requests
import json
import os

def generate_content(prompt: str):
    response = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.getenv('openrouterapikey')}"
            # "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
            # "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
        },
        data=json.dumps({
            # "model": "openai/gpt-4o", # Optional
            "model": "anthropic/claude-sonnet-4",
            "messages": [
                {
                    "role": "user", 
                    "content": prompt
                }
            ]
        })
    )
    return response

if __name__ == "__main__":
    response = generate_content("What is the meaning of life?")
    print(response.json())
    