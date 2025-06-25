# tasks.py
import time, os
import dramatiq
import logging
from worker_setup import broker  # ensure this initializes Dramatiq
from helpers import call_ai_service, inject_pwa_support  # your custom functions
from helpers import strip_code_block  # your util to clean response
from db import get_db, Site, CSSGeneration, PushSubscription
from pywebpush import webpush, WebPushException
from ai.factory import AIProviderFactory
import json

logger = logging.getLogger(__name__)

def send_push_notification(subscription, title, body, url=None):
    """Send a push notification to a subscription"""
    try:
        logger.info(f"Attempting to send push notification to subscription: {subscription.endpoint}")
        logger.info(f"VAPID private key available: {bool(os.getenv('VAPID_PRIVATE_KEY'))}")
        logger.info(f"VAPID mailto available: {bool(os.getenv('VAPID_MAILTO'))}")
        
        vapid_private_key = os.getenv('VAPID_PRIVATE_KEY')
        vapid_claims = {
            "sub": f"mailto:{os.getenv('VAPID_MAILTO')}"
        }
        
        payload = {
            "title": title,
            "body": body,
            "url": url
        }
        
        logger.info(f"Sending notification with payload: {payload}")
        
        webpush(
            subscription_info=subscription.to_dict(),
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key,
            vapid_claims=vapid_claims
        )
        logger.info(f"Push notification sent successfully to {subscription.endpoint}")
        return True
    except WebPushException as e:
        logger.error(f"WebPushException details: status_code={e.response.status_code if e.response else 'None'}, message={str(e)}")
        if e.response and e.response.status_code == 410:
            # Subscription has expired or is no longer valid
            logger.info(f"Subscription {subscription.endpoint} is no longer valid")
            with get_db() as db:
                subscription.is_active = 'inactive'
                db.commit()
        else:
            logger.error(f"Failed to send push notification: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending push notification: {str(e)}", exc_info=True)
        return False

@dramatiq.actor(max_retries=0, time_limit=15 * 60 * 1000)  # 15 min timeout in ms
def generate_site_task(site_id, prompt):
    start_time = time.time()
    logger.info(f"[Task] Starting site generation for site_id: {site_id}")
    
    try:
        # Call AI service
        logger.info("[Task] Calling AI service")
        ai_start_time = time.time()
        ai_html = call_ai_service(prompt)
        ai_duration = time.time() - ai_start_time
        logger.info(f"[Task] AI service completed in {ai_duration:.2f}s")
        
        # Inject PWA support
        logger.info("[Task] Injecting PWA support")
        pwa_start_time = time.time()
        ai_html = inject_pwa_support(ai_html, site_id)
        pwa_duration = time.time() - pwa_start_time
        logger.info(f"[Task] PWA injected in {pwa_duration:.2f}s")
        
        # Save to database
        logger.info("[Task] Saving to database")
        max_retries = 3
        db_retry_delay = 1  # seconds
        
        for attempt in range(max_retries):
            try:
                with get_db() as db:
                    site = db.query(Site).filter(Site.id == site_id).first()
                    if site:
                        # Update site content and status if not already successful
                        if site.status != "success":
                            site.content = ai_html
                            site.status = "success"
                            db.commit()
                            logger.info(f"[Task] Updated site {site_id} status to success")
                        
                        # Send notification if there's a subscription, regardless of previous status
                        if site.subscription_id:
                            logger.info(f"[Task] Found subscription_id: {site.subscription_id}")
                            subscription = db.query(PushSubscription).filter(
                                PushSubscription.id == site.subscription_id,
                                PushSubscription.is_active == 'active'
                            ).first()
                            
                            if subscription:
                                logger.info(f"[Task] Found active subscription: {subscription.endpoint}")
                                site_url = f"/site/{site_id}"
                                app_name = site.app_name or "Super Cool App"
                                notification_sent = send_push_notification(
                                    subscription,
                                    "Site Generation Complete! 🎉",
                                    f"{app_name} is ready to view",
                                    site_url
                                )
                                logger.info(f"[Task] Notification send attempt result: {notification_sent}")
                            else:
                                logger.info(f"[Task] No active subscription found for subscription_id: {site.subscription_id}")
                        else:
                            logger.info(f"[Task] No subscription_id found for site: {site_id}")
                    else:
                        site = Site(id=site_id, content=ai_html, status="success")
                        db.add(site)
                        db.commit()
                        logger.info(f"[Task] Created new site {site_id}")
                    return
            except Exception as db_error:
                if attempt == max_retries - 1:
                    raise db_error
                logger.warning(f"DB retry {attempt+1} failed: {str(db_error)}")
                time.sleep(db_retry_delay * (attempt + 1))

    except TimeoutError as e:
        logger.error(f"[Task Timeout] {e}")
        with get_db() as db:
            site = db.query(Site).filter(Site.id == site_id).first()
            if site:
                site.status = "timeout"
                # Send notification for timeout if there's a subscription
                if site.subscription_id:
                    subscription = db.query(PushSubscription).filter(
                        PushSubscription.id == site.subscription_id,
                        PushSubscription.is_active == 'active'
                    ).first()
                    if subscription:
                        send_push_notification(
                            subscription,
                            "Site Generation Timeout ⏰",
                            "Your site generation took too long. Please try again.",
                            None
                        )
                db.commit()
        raise

    except Exception as e:
        logger.error(f"[Task Error] {e}")
        with get_db() as db:
            site = db.query(Site).filter(Site.id == site_id).first()
            if site:
                site.status = "error"
                # Send notification for error if there's a subscription
                if site.subscription_id:
                    subscription = db.query(PushSubscription).filter(
                        PushSubscription.id == site.subscription_id,
                        PushSubscription.is_active == 'active'
                    ).first()
                    if subscription:
                        send_push_notification(
                            subscription,
                            "Site Generation Failed ❌",
                            "There was an error generating your site. Please try again.",
                            None
                        )
                db.commit()
        raise

@dramatiq.actor(max_retries=0, time_limit=15 * 60 * 1000)  # 15 min timeout in ms
def generate_css_task(css_id, prompt, css_content):
    logger.info(f"[Task] Starting CSS generation for css_id: {css_id}")
    try:
        # Get the configured provider (default to OpenRouter)
        provider_name = os.getenv("AI_PROVIDER", "openrouter")
        provider = AIProviderFactory.get_provider(provider_name)
        
        logger.info(f"[Task] Using AI provider: {provider_name}")
        
        css_prompt = f"""
I need you to act as an LEGENDARY webapp desiner. 
There is code someone wrote that needs to be elevated.
Friends are coming to you for your expertise and knowledge.
You are generous with your gifts, helping all who need you.
You only need reply with complete CSS code to help your friend's dreams come true. 
You need not explain yourself as you are the foremost expert on code.
You simply reply with code. Nothing else. Efficiently helping your friends.

Here are some basic requests from your friends:
- Create valid, production-ready CSS
- Use mobile-first responsive design (min-width media queries)
- Employ semantic class naming (BEM methodology preferred)
- Utilize modern CSS (flexbox, grid, custom properties)
- Include appropriate browser fallbacks
- Optimize for performance (efficient selectors, minimal specificity)

Of course, you enjoy helping your friends build and want to make the best version possible.
Here is the idea your friend needs you to make a reality: {prompt}
And here is the code that needs to be modified: {css_content}
"""

        logger.info("[Task] Calling AI service for CSS generation")
        new_css = provider.generate_content(css_prompt)
        new_css = strip_code_block(new_css)

        logger.info("[Task] Saving to database")
        with get_db() as db:
            css_gen = db.query(CSSGeneration).filter(CSSGeneration.id == css_id).first()
            if css_gen:
                css_gen.status = 'completed'
                css_gen.css_content = new_css
                db.commit()
                logger.info(f"[Task] CSS generation completed for css_id: {css_id}")

        return

    except Exception as e:
        logger.error(f"[Task Error] Error in CSS generation: {str(e)}")
        with get_db() as db:
            css_gen = db.query(CSSGeneration).filter(CSSGeneration.id == css_id).first()
            if css_gen:
                css_gen.status = 'error'
                css_gen.error = str(e)
                db.commit()
        raise
