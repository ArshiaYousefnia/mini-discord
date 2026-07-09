from django.urls import path, include
from rest_framework.routers import DefaultRouter


from .views import SendDirectMessageView, ConversationViewSet, MessageViewSet, ConversationListView, \
    ConversationMarkReadView, GroupCreateView,GroupJoinView



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
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<uuid:conversation_id>/mark_read/', ConversationMarkReadView.as_view(), name='conversation-mark-read'),
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
    path(
        'conversations/groups/create/',
        GroupCreateView.as_view(),
        name='group-create'
    ),
    path(
        'conversations/groups/join/<uuid:invite_token>/', 
        GroupJoinView.as_view(), 
        name='group-join'
    ),
]