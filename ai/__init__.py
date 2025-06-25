"""
AI module for PocketVibe
Provides interfaces and implementations for various AI providers
"""

from .base import AIProvider

# Use lazy imports to avoid circular dependencies
def get_provider(provider_name: str):
    """Lazy import of provider classes"""
    if provider_name.lower() == "openai":
        from .providers.openai_provider import OpenAIProvider
        return OpenAIProvider
    elif provider_name.lower() == "anthropic":
        from .providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider
    elif provider_name.lower() == "openrouter":
        from .providers.openrouter_provider import OpenRouterProvider
        return OpenRouterProvider
    elif provider_name.lower() == "stability":
        from .providers.stability_provider import StabilityAIProvider
        return StabilityAIProvider
    else:
        raise ValueError(f"Unknown provider: {provider_name}")

__all__ = ['AIProvider', 'get_provider'] 