from django.urls import path, include
from rest_framework.routers import DefaultRouter

<<<<<<< HEAD

from .views import SendDirectMessageView, ConversationViewSet, MessageViewSet, ConversationListView, \
    ConversationMarkReadView



=======
from .views import SendDirectMessageView, ConversationViewSet, MessageViewSet, ConversationListView, \
    ConversationMarkReadView
>>>>>>> c20b185 (added new backend)

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
<<<<<<< HEAD

    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
path('conversations/<uuid:conversation_id>/mark_read/', ConversationMarkReadView.as_view(), name='conversation-mark-read'),
    path('', include(router.urls)),



=======
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
path('conversations/<uuid:conversation_id>/mark_read/', ConversationMarkReadView.as_view(), name='conversation-mark-read'),
    path('', include(router.urls)),
>>>>>>> c20b185 (added new backend)
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