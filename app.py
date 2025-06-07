"""
PocketVibe - A web application that generates and deploys websites using AI

This application provides several key features:
1. Website Generation: Creates websites from text descriptions using AI
2. PWA Support: Converts websites into Progressive Web Apps
3. Custom Styling: Generates custom CSS based on user descriptions
4. Site Management: Handles site storage, retrieval, and status tracking
5. Icon Management: Processes and stores custom app icons

Main Components:
- Database Layer: PostgreSQL with SQLAlchemy ORM
- Background Processing: Dramatiq with PostgreSQL
- AI Integration: OpenAI API for content generation
- File System: Static file serving and icon management
- Caching: Redis-based response caching
"""

from flask import Flask, render_template, request, jsonify, Response, send_from_directory, make_response
from flask_cors import CORS
import os, re, json, time, uuid, logging, bleach
from lightningpay import lightning_quote, invoice_status
from ai.factory import AIProviderFactory
from db import get_db, init_db, Site, Waitlist, Contact, CSSGeneration, PushSubscription
from tasks import generate_site_task, generate_css_task
from datetime import datetime

# ======================
# Application Setup
# ======================

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static')
CORS(app)

# Configure VAPID keys from environment variables
app.config['VAPID_PUBLIC_KEY'] = os.environ.get('VAPID_PUBLIC_KEY')
app.config['VAPID_PRIVATE_KEY'] = os.environ.get('VAPID_PRIVATE_KEY')
app.config['VAPID_MAILTO'] = os.environ.get('VAPID_MAILTO')

# ======================
# API Endpoints
# ======================

@app.route("/")
def index():
    """Main application entry point"""
    return render_template("index.html", vapid_public_key=app.config['VAPID_PUBLIC_KEY'])
    # return render_template("test.html")

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/service-worker.js')
def service_worker():
    response = make_response(
        # Send from local directory instead of static folder
        send_from_directory('.', 'service-worker.js')
    )
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/api/generate-site', methods=['POST'])
def generate_site():
    """
    Generates a new website based on user description
    Flow:
    1. Validates input and client-generated site_id
    2. Creates database record with 'processing' status and subscription info
    3. Starts async processing with Dramatiq
    4. Returns immediately with site ID
    """
    start_time = time.time()
    logger.info("[Request] Received generate-site request")
    
    try:
        data = request.get_json()
        if not data or 'prompt' not in data or 'site_id' not in data:
            return jsonify({"message": "No prompt or site_id provided"}), 400
            
        site_id = data['site_id']
        
        # Validate site_id format
        if not re.match(r'^pv_[a-f0-9]{8}$', site_id):
            return jsonify({"message": "Invalid site_id format"}), 400
            
        # Check if site_id already exists
        with get_db() as db:
            existing_site = db.query(Site).filter(Site.id == site_id).first()
            if existing_site:
                return jsonify({"message": "Site ID already exists"}), 409
        
        logger.info(f"[Request] Using client-provided site_id: {site_id}")
        
        # Handle subscription if provided
        subscription_id = None
        if data.get('subscription'):
            try:
                with get_db() as db:
                    # Check if subscription already exists
                    existing_sub = db.query(PushSubscription).filter_by(
                        endpoint=data['subscription']['endpoint']
                    ).first()
                    
                    if existing_sub:
                        subscription_id = existing_sub.id
                        # Update last_used timestamp
                        existing_sub.last_used = datetime.utcnow()
                    else:
                        # Create new subscription
                        new_sub = PushSubscription(
                            endpoint=data['subscription']['endpoint'],
                            auth=data['subscription']['keys']['auth'],
                            p256dh=data['subscription']['keys']['p256dh'],
                            user_agent=request.headers.get('User-Agent')
                        )
                        db.add(new_sub)
                        db.flush()  # Get the ID without committing
                        subscription_id = new_sub.id
                    
                    db.commit()
                    logger.info(f"[Request] Subscription handled: {subscription_id}")
            except Exception as sub_error:
                logger.error(f"[Error] Failed to handle subscription: {str(sub_error)}")
                # Continue without subscription - don't fail the request
        
        # Create initial site record with 'processing' status
        try:
            with get_db() as db:
                site = Site(
                    id=site_id,
                    status='processing',
                    created_at=datetime.utcnow(),
                    subscription_id=subscription_id
                )
                db.add(site)
                db.commit()
                logger.info(f"[Request] Created site record with ID: {site_id}")
        except Exception as db_error:
            logger.error(f"[Error] Failed to create site record: {str(db_error)}")
            return jsonify({
                "status": "error",
                "message": "Failed to initialize site generation"
            }), 500
        
        # Start the Dramatiq task
        logger.info("[Request] Starting Dramatiq task")
        task_start_time = time.time()
        generate_site_task.send(site_id, data['prompt'])
        task_duration = time.time() - task_start_time
        
        total_duration = time.time() - start_time
        logger.info(f"[Complete] Request processed in {total_duration:.2f} seconds (Dramatiq task started in {task_duration:.2f} seconds)")
        
        return jsonify({
            "status": "processing",
            "site_id": site_id,
            "message": "Site generation started"
        })
            
    except Exception as e:
        total_duration = time.time() - start_time
        logger.error(f"[Error] Request failed after {total_duration:.2f} seconds: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/site/<site_id>', methods=['GET'])
# @cache_response(timeout=31536000)  # Cache for 1 year
def view_site(site_id):
    """Render a deployed site for visitors"""
    try:
        with get_db() as db:
            site = db.query(Site).filter(Site.id == site_id).first()
            
            if site:
                # Return the HTML content directly
                return Response(site.content, mimetype='text/html')
            else:
                return render_template("site_not_found.html"), 404
            
    except Exception as e:
        return f"Error loading site: {str(e)}", 500

@app.route('/site/<site_id>/manifest.json', methods=['GET'])
# @cache_response(timeout=31536000)  # Cache for 1 year
def serve_site_manifest(site_id):
    """Serve the manifest.json for a specific user site"""
    try:
        # Fetch site data from database
        with get_db() as db:
            site = db.query(Site).filter(Site.id == site_id).first()
            
            if not site:
                return "Site not found", 404
            
            # Use the stored app_name from DB, or default to 'Super Cool App'
            site_name = site.app_name if site.app_name else "Super Cool App"
            short_name = site_name if len(site_name) <= 14 else site_name[:14]
            
            # Get icon URL from database
            icon_url = site.icon_url if site.icon_url else "/static/icons/pocketvibe.png"
            
            # Create the manifest JSON
            manifest = {
                "name": site_name,
                "short_name": short_name,
                "description": f"Created with PocketVibe",
                "start_url": f"/site/{site_id}",
                "display": "standalone",
                "background_color": "#121212",
                "theme_color": "#121212",
                "icons": [
                    {
                        "src": icon_url,
                        "sizes": "512x512",
                        "type": "image/png"
                    }
                ]
            }
            
            return Response(
                json.dumps(manifest),
                mimetype='application/json'
            )
            
    except Exception as e:
        app.logger.error(f"Error serving manifest for site {site_id}: {str(e)}")
        return "Error generating manifest", 500

@app.route('/site/<site_id>/sw.js')
# @cache_response(timeout=31536000)  # Cache for 1 year
def serve_service_worker(site_id):
    """Serve a service worker for the site"""
    sw_content = f"""
    const CACHE_NAME = 'pocketvibe-site-{site_id}-v1';
    const SITE_URL = '/site/{site_id}';

    // Install service worker
    self.addEventListener('install', event => {{
        event.waitUntil(
            // Cache the main site content
            caches.open(CACHE_NAME).then(cache => {{
                return fetch(SITE_URL)
                    .then(response => {{
                        if (!response || response.status !== 200) {{
                            throw new Error('Failed to cache site content');
                        }}
                        return cache.put(SITE_URL, response);
                    }});
            }})
        );
    self.skipWaiting();
    }});

    // Activate and clean up old caches
    self.addEventListener('activate', event => {{
    event.waitUntil(
            Promise.all([
                // Clean up old caches
        caches.keys().then(cacheNames => {{
        return Promise.all(
                        cacheNames
                            .filter(cacheName => cacheName !== CACHE_NAME)
                            .map(cacheName => caches.delete(cacheName))
                    );
                }}),
                // Take control of all clients
                clients.claim()
            ])
        );
    }});

    // Fetch event handler - Cache First strategy for site content
    self.addEventListener('fetch', event => {{
        // Skip non-GET requests
        if (event.request.method !== 'GET') return;

        // Handle navigation requests
        if (event.request.mode === 'navigate') {{
    event.respondWith(
        fetch(event.request)
                    .then(response => {{
                        // Cache the response
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {{
                                cache.put(event.request, responseToCache);
                            }});
                        return response;
                    }})
        .catch(() => {{
                        // Return cached site content for offline navigation
                        return caches.match(SITE_URL);
        }})
    );
            return;
        }}

        // Handle other requests
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {{
                    if (cachedResponse) {{
                        return cachedResponse;
                    }}

                    return fetch(event.request)
                        .then(response => {{
                            if (!response || response.status !== 200) {{
                                return response;
                            }}

                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {{
                                    cache.put(event.request, responseToCache);
                                }});

                            return response;
                        }})
                        .catch(() => {{
                            // Return cached site content for offline requests
                            return caches.match(SITE_URL);
                        }});
                }})
        );
    }});
    """
    
    return Response(sw_content, mimetype='application/javascript')

@app.route('/api/site-status/<site_id>', methods=['GET'])
# @cache_response(timeout=30)  # Cache for 30 seconds
def check_site_status(site_id):
    """Check the deployment status of a site"""
    try:
        with get_db() as db:
            try:
                site = db.query(Site).filter(Site.id == site_id).first()
                
                if not site:
                    return jsonify({
                        "status": "error",
                        "message": "Site not found"
                    }), 404
                
                return jsonify({
                    "status": site.status,
                    "site_id": site_id
                })

                # NOTE: For testing purposes: return successful response and existing site_id
                # return jsonify({
                #     "status": "success",
                #     "site_id": "35cb3160"
                # })
            except Exception as e:
                logger.error(f"Database query error: {str(e)}")
                return jsonify({
                    "status": "error",
                    "message": "Database connection error"
                }), 500
            
    except Exception as e:
        logger.error(f"Error checking site status: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/generate-icon', methods=['POST'])
def generate_icon():
    """Generate an icon using AI based on a text prompt"""
    try:
        data = request.get_json()
        if not data or 'prompt' not in data:
            return jsonify({"status": "error", "message": "No prompt provided"}), 400

        prompt = data['prompt']
        
        # Get the configured provider (default to OpenAI)
        provider_name = os.getenv("AI_PROVIDER", "openai")
        provider = AIProviderFactory.get_provider(provider_name)
        
        # Generate image using the provider
        icon_url = provider.generate_image(prompt)
            
        return jsonify({
            "status": "success",
            "icon_url": icon_url
        })
        
    except Exception as e:
        logger.error(f"Error generating icon: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/update-app-icon', methods=['POST'])
def update_app_icon():
    """Update app icon URL and modify HTML content"""
    try:
        logger.info("Starting app icon update process")
        data = request.get_json()
        if not data:
            logger.error("No JSON data provided in request")
            return jsonify({"status": "error", "message": "No JSON data provided"}), 400

        app_name = data.get('app_name')
        image_url = data.get('image_url')
        site_id = data.get('site_id')

        logger.info(f"Received request for app_name: {app_name}, site_id: {site_id}, image_url: {image_url}")

        if not all([app_name, site_id]):
            logger.error(f"Missing required parameters. app_name: {bool(app_name)}, site_id: {bool(site_id)}")
            return jsonify({
                "status": "error",
                "message": "Missing required parameters: app_name and site_id are required"
            }), 400

        # Store original app_name and create URL-friendly version
        original_app_name = app_name.strip()
        base_app_url = original_app_name.lower().replace(' ', '-')
        
        # Check for special characters in URL version
        if not base_app_url.replace('-', '').isalnum():
            logger.error(f"Invalid app_name: {app_name} contains special characters")
            return jsonify({
                "status": "error",
                "message": "App name can only contain letters, numbers, and hyphens"
            }), 400

        # Generate unique app_url by checking existing IDs
        with get_db() as db:
            # Get all existing IDs that start with our base_app_url
            existing_ids = db.query(Site.id).filter(
                Site.id.like(f"{base_app_url}%")
            ).all()
            existing_ids = [id[0] for id in existing_ids]  # Convert from tuple to list
            
            if not existing_ids:
                # No conflicts, use base_app_url
                app_url = base_app_url
            else:
                # Find the next available number to append
                # First try base_app_url1, then base_app_url2, etc.
                counter = 1
                while f"{base_app_url}{counter}" in existing_ids:
                    counter += 1
                app_url = f"{base_app_url}{counter}"
            
            logger.info(f"Generated unique app_url: {app_url} (base: {base_app_url})")

        # Process image if URL is provided
        if image_url:
            pass
            # try:
            #     if image_url.startswith("https://pocket-vibe"):
            #         icon_path = image_url
            #         logger.info(f"Image processed successfully, saved as: {icon_path}")
            #     else:
            #         logger.info(f"Processing image from URL: {image_url}")
            #         icon_path = download_and_resize_image(image_url, app_url)
            #         logger.info(f"Image processed successfully, saved as: {icon_path}")
            # except Exception as e:
            #     logger.error(f"Failed to process image: {str(e)}")
            #     return jsonify({
            #         "status": "error",
            #         "message": f"Failed to process image: {str(e)}"
            #     }), 400
        else:
            # Use default icon if no image URL provided
            image_url = "/static/icons/pocketvibe.png"
            logger.info("No image URL provided, using default icon")

        # Get current HTML content
        logger.info(f"Retrieving HTML content for site_id: {site_id}")
        with get_db() as db:
            site = db.query(Site).filter(Site.id == site_id).first()
        
        if not site:
            logger.error(f"Site not found for site_id: {site_id}")
            return jsonify({"status": "error", "message": "Site not found"}), 404

        html_content = site.content
        logger.info("Successfully retrieved HTML content")

        # Update icon paths in HTML
        logger.info("Updating HTML content with new paths")
        
        # Update manifest.json icon paths
        manifest_pattern = r'<link\s+rel="manifest"\s+href="[^"]*">'
        manifest_replacement = f'<link rel="manifest" href="/site/{app_url}/manifest.json">'
        html_content = re.sub(manifest_pattern, manifest_replacement, html_content)
        logger.info("Updated manifest.json path")

        # Update regular icon
        icon_pattern = r'<link\s+rel="icon"\s+href="[^"]*"[^>]*>'
        icon_replacement = f'<link rel="icon" href="{image_url}" type="image/png">'
        html_content = re.sub(icon_pattern, icon_replacement, html_content)
        logger.info("Updated regular icon path")

        # Update apple-touch-icon
        apple_icon_pattern = r'<link\s+rel="apple-touch-icon"\s+href="[^"]*"[^>]*>'
        apple_icon_replacement = f'<link rel="apple-touch-icon" href="{image_url}" type="image/png">'
        html_content = re.sub(apple_icon_pattern, apple_icon_replacement, html_content)
        logger.info("Updated apple-touch-icon path")

        # Save updated content with new site_id (app_url), app_name, and icon_url
        logger.info(f"Saving updated content with new app_url: {app_url} and app_name: {original_app_name}")
        with get_db() as db:
            new_site = Site(
                id=app_url,
                content=html_content,
                status="success",
                app_name=original_app_name,
                icon_url=image_url
            )
            db.add(new_site)
            db.commit()

        logger.info(f"App icon update completed successfully for app_url: {app_url}")
        return jsonify({
            "status": "success",
            "message": "App icon updated successfully",
            "app_url": app_url,
            "app_name": original_app_name,
            "icon_url": image_url
        })

    except Exception as e:
        logger.error(f"Unexpected error in update_app_icon: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/generate-css', methods=['POST'])
def generate_css():
    try:
        data = request.get_json()
        if not data or 'prompt' not in data:
            return jsonify({'error': 'No prompt provided'}), 400

        prompt = data['prompt']
        css_id = str(uuid.uuid4())
        
        # Read the base CSS file
        css_file_path = 'static/style.css'
        with open(css_file_path, 'r', encoding='utf-8') as css_file:
            css_content = css_file.read()
        
        # Store the initial status in the database
        with get_db() as db:
            css_gen = CSSGeneration(
                id=css_id,
                prompt=prompt,
                status='processing'
            )
            db.add(css_gen)
            db.commit()
        
        # Start the Dramatiq task
        logger.info(f"[Request] Starting CSS generation task for css_id: {css_id}")
        try:
            generate_css_task.send(css_id, prompt, css_content)
            logger.info(f"[Request] CSS generation task enqueued successfully")
        except Exception as e:
            logger.error(f"[Request] Failed to enqueue CSS generation task: {str(e)}")
            raise
        
        return jsonify({
            'css_id': css_id,
            'status': 'processing'
        })
        
    except Exception as e:
        logger.error(f"Error in generate_css endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/css-status/<css_id>', methods=['GET'])
def check_css_status(css_id):
    try:
        with get_db() as db:
            css_gen = db.query(CSSGeneration).filter(CSSGeneration.id == css_id).first()
        
        if not css_gen:
            return jsonify({'error': 'CSS generation not found'}), 404
            
        return jsonify({
            'status': css_gen.status,
            'css_content': css_gen.css_content if css_gen.status == 'completed' else None,
            'error': css_gen.error if css_gen.status == 'error' else None
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/appify', methods=['POST'])
def appify_website():
    """Create a PWA wrapper for any website"""
    try:
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({'error': 'No URL provided'}), 400

        target_url = data['url']
        
        # Generate a unique ID for this appified site
        site_id = str(uuid.uuid4())[:8]
        
        # Create the PWA wrapper HTML
        wrapper_html = f'''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Appified Website</title>
    <link rel="manifest" href="/site/{site_id}/manifest.json">
    <meta name="theme-color" content="#121212"/>
    <meta name="description" content="Appified website using PocketVibe"/>
    <meta name="mobile-web-app-capable" content="yes">
    <link rel="apple-touch-icon" href="/static/icons/pocketvibe.png" type="image/png">
    <style>
        body, html {{
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }}
        iframe {{
            width: 100%;
            height: 100%;
            border: none;
        }}
    </style>
    <script>
        // Register service worker
        if ('serviceWorker' in navigator) {{
            window.addEventListener('load', () => {{
                navigator.serviceWorker.register('/site/{site_id}/sw.js')
                    .then(reg => console.log('Service worker registered'))
                    .catch(err => console.log('Service worker registration failed', err));
            }});
        }}
    </script>
</head>
<body>
    <iframe src="{target_url}" allow="fullscreen" allowfullscreen></iframe>
</body>
</html>
'''
        
        # Store in database
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute(
                "INSERT INTO sites (id, content, status) VALUES (?, ?, ?)",
                (site_id, wrapper_html, "success")
            )
            db.commit()
        
        # Return the new URL
        site_url = f"/site/{site_id}"
        return jsonify({
            "status": "success",
            "site_id": site_id,
            "url": site_url
        })
        
    except Exception as e:
        logger.error(f"Error appifying website: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/generate-invoice', methods=['POST'])
def generate_invoice():
    try:
        data = request.get_json()
        satoshis = float(data.get('amount'))  # Convert to float
        # Convert satoshis to BTC (1 BTC = 100,000,000 satoshis)
        amount = satoshis / 100000000
        description = "Pocket Vibe Tip"
        
        # Generate invoice
        lninv, conv_rate, invid = lightning_quote(amount, description)
        
        return jsonify({
            'status': 'success',
            'lnInvoice': lninv,
            'conversionRate': conv_rate,
            'invoiceId': invid
        })
    except Exception as e:
        logging.error(f"Error generating invoice: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/check-invoice/<invoice_id>', methods=['GET'])
def check_invoice(invoice_id):
    try:
        # Check if invoice is paid using lightningpay.py
        status = invoice_status(invoice_id)
        is_paid = status == "PAID"
        
        return jsonify({
            'status': 'success',
            'isPaid': is_paid
        })
    except Exception as e:
        logging.error(f"Error checking invoice: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/global-sites', methods=['GET'])
# @cache_response(timeout=300)  # Cache for 5 minutes
def get_global_sites():
    """Get all site URLs from the database"""
    try:
        with get_db() as db:
            sites = db.query(Site).filter(Site.status == 'success').all()
            
            # Format the response with site details
            site_list = [{
                'id': site.id,
                'url': f"/site/{site.id}",
                'app_name': site.app_name or 'Super Cool App',
                'created_at': site.created_at.isoformat() if site.created_at else None,
                'icon_url': site.icon_url or '/static/icons/pocketvibe.png'
            } for site in sites]
            
            return jsonify({
                'status': 'success',
                'sites': site_list,
                'total': len(site_list)
            })
            
    except Exception as e:
        logger.error(f"Error fetching global sites: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/waitlist')
def waitlist():
    return render_template('waitlist.html')

@app.route('/api/waitlist', methods=['POST'])
def join_waitlist():
    try:
        data = request.get_json()
        contact = data.get('contact')
        contact_type = data.get('type')
        
        if not contact or not contact_type:
            return jsonify({'status': 'error', 'message': 'Missing required fields'}), 400
            
        if contact_type not in ['email', 'npub']:
            return jsonify({'status': 'error', 'message': 'Invalid contact type'}), 400
            
        # Basic validation
        if contact_type == 'email' and '@' not in contact:
            return jsonify({'status': 'error', 'message': 'Invalid email format'}), 400
        elif contact_type == 'npub' and not contact.startswith('npub'):
            return jsonify({'status': 'error', 'message': 'Invalid npub format'}), 400
            
        # Insert into database using SQLAlchemy
        with get_db() as db:
            waitlist_entry = Waitlist(
                contact=contact,
                type=contact_type
            )
            db.add(waitlist_entry)
            db.commit()
        
        logger.info(f"New waitlist signup - Type: {contact_type}, Contact: {contact}")
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        logger.error(f"Error in waitlist signup: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/api/contact', methods=['POST'])
def submit_contact():
    try:
        data = request.get_json()
        contact = data.get('contact')
        contact_type = data.get('type')
        message = data.get('message')
        
        if not message:
            return jsonify({'status': 'error', 'message': 'Message is required'}), 400
            
        # Only validate contact if it's provided
        if contact and contact.strip():  # Check if contact is not empty after stripping whitespace
            if not contact_type:
                return jsonify({'status': 'error', 'message': 'Contact type is required when contact is provided'}), 400
                
            if contact_type not in ['email', 'npub']:
                return jsonify({'status': 'error', 'message': 'Invalid contact type'}), 400
                
            # Basic validation
            if contact_type == 'email' and '@' not in contact:
                return jsonify({'status': 'error', 'message': 'Invalid email format'}), 400
            elif contact_type == 'npub' and not contact.startswith('npub'):
                return jsonify({'status': 'error', 'message': 'Invalid npub format'}), 400
        else:
            # If contact is empty or only whitespace, set both contact and type to None
            contact = None
            contact_type = None
            
        # Insert into database using SQLAlchemy
        with get_db() as db:
            contact_entry = Contact(
                contact=contact,
                type=contact_type,
                message=message
            )
            db.add(contact_entry)
            db.commit()
        
        logger.info(f"New contact message - Type: {contact_type}, Contact: {contact}")
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        logger.error(f"Error in contact submission: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/subscribe', methods=['POST'])
def subscribe():
    """Handle push subscription registration"""
    try:
        data = request.get_json()
        if not data or 'subscription' not in data:
            return jsonify({'error': 'No subscription data provided'}), 400

        subscription = data['subscription']
        
        # Validate subscription data
        if not all(key in subscription for key in ['endpoint', 'keys']):
            return jsonify({'error': 'Invalid subscription data'}), 400
        if not all(key in subscription['keys'] for key in ['auth', 'p256dh']):
            return jsonify({'error': 'Invalid subscription keys'}), 400

        # Get user agent for tracking
        user_agent = request.headers.get('User-Agent', 'Unknown')
        
        # Store or update the subscription in the database
        with get_db() as db:
            # Check if subscription already exists
            existing = db.query(PushSubscription).filter(
                PushSubscription.endpoint == subscription['endpoint']
            ).first()
            
            if existing:
                # Update existing subscription
                existing.auth = subscription['keys']['auth']
                existing.p256dh = subscription['keys']['p256dh']
                existing.user_agent = user_agent
                existing.last_used = datetime.utcnow()
                existing.is_active = 'active'
                logger.info(f"Updated existing push subscription: {subscription['endpoint']}")
            else:
                # Create new subscription
                new_sub = PushSubscription(
                    endpoint=subscription['endpoint'],
                    auth=subscription['keys']['auth'],
                    p256dh=subscription['keys']['p256dh'],
                    user_agent=user_agent
                )
                db.add(new_sub)
                logger.info(f"Created new push subscription: {subscription['endpoint']}")
            
            db.commit()
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        logger.error(f"Error in push subscription: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/unsubscribe', methods=['POST'])
def unsubscribe():
    """Handle push subscription removal"""
    try:
        data = request.get_json()
        if not data or 'subscription' not in data:
            return jsonify({'error': 'No subscription data provided'}), 400

        subscription = data['subscription']
        endpoint = subscription.get('endpoint')
        
        if not endpoint:
            return jsonify({'error': 'No endpoint provided'}), 400

        # Mark subscription as inactive in the database
        with get_db() as db:
            existing = db.query(PushSubscription).filter(
                PushSubscription.endpoint == endpoint
            ).first()
            
            if existing:
                existing.is_active = 'inactive'
                existing.last_used = datetime.utcnow()
                db.commit()
                logger.info(f"Deactivated push subscription: {endpoint}")
            else:
                logger.warning(f"Attempted to unsubscribe non-existent endpoint: {endpoint}")
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        logger.error(f"Error in push unsubscription: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ======================
# Application Initialization
# ======================

# Initialize database on startup
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)