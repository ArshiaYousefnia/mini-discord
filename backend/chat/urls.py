from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import SendDirectMessageView, ConversationViewSet, MessageViewSet

router = DefaultRouter()
router.register(r'dm', SendDirectMessageView, basename='direct-message')
router.register(r'conversations', ConversationViewSet, basename='conversation')

conversation_messages_list = MessageViewSet.as_view({
    'get': 'list',
})

conversation_message_detail = MessageViewSet.as_view({
    'patch': 'partial_update',
    'delete': 'destroy',
})

urlpatterns = [
    path('', include(router.urls)),

    path(
        'conversations/<uuid:conversation_pk>/messages/',
        conversation_messages_list,
        name='conversation-messages',
    ),

    path(
        'conversations/<uuid:conversation_pk>/messages/<uuid:pk>/',
        conversation_message_detail,
        name='conversation-message-detail',
    ),
]