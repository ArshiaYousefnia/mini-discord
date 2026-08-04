import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

from users.routing import websocket_urlpatterns as user_websocket_urlpatterns
from chat.routing import websocket_urlpatterns as chat_websocket_urlpatterns


combined_websocket_urlpatterns = user_websocket_urlpatterns + chat_websocket_urlpatterns

from users.middleware import JWTWebsocketMiddleware

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": JWTWebsocketMiddleware(
        AuthMiddlewareStack(
            URLRouter(combined_websocket_urlpatterns)
        )
    ),
})
