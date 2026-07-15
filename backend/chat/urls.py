from django.urls import path, include
from rest_framework.routers import DefaultRouter


from .views import ChannelPublicIdView,ChannelJoinView,GroupDeleteView, GroupUpdateView, GroupMembersView, SendDirectMessageView, ConversationViewSet, \
    MessageViewSet, ConversationListView, \
    ConversationMarkReadView, GroupCreateView, GroupJoinView, GroupProfileView, ChannelCreateView,ChannelProfileView

router = DefaultRouter()
router.register(r'dm', SendDirectMessageView, basename='direct-message')
router.register(r'conversations', ConversationViewSet, basename='conversation')

conversation_messages_list = MessageViewSet.as_view({
    'get': 'list',
    'post': 'create', 
})

conversation_message_detail = MessageViewSet.as_view({
    'patch': 'partial_update',
    'delete': 'destroy',
})
urlpatterns = [
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path(
        'conversations/<uuid:pk>/leave/',
        ConversationViewSet.as_view({'post': 'leave'}),
        name='conversation-leave',
    ),
    path(
        'conversations/<uuid:pk>/remove-member/',
        ConversationViewSet.as_view({'post': 'remove_member'}),
        name='conversation-remove-member',
    ),
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
        'conversations/<uuid:conversation_pk>/messages/search/',
        MessageViewSet.as_view({'get': 'search'}),
        name='conversation-messages-search',
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
    path(
        'conversations/groups/<uuid:conversation_id>/profile/',
        GroupProfileView.as_view(),
        name='group-profile'
    ),
    path(
        'conversations/groups/<uuid:conversation_id>/members/',
        GroupMembersView.as_view(),
        name='group-members'
    ),
    path(
        "conversations/groups/<uuid:conversation_id>/edit/",
        GroupUpdateView.as_view(),
        name="group-update",
    ),


    path(
        "conversations/groups/<uuid:conversation_id>/",
        GroupDeleteView.as_view(),
        name="group-delete",
    ),
    path(
        'channels/create/',
        ChannelCreateView.as_view(),
        name='channel-create',
    ),
    path(
    "channels/<uuid:conversation_id>/profile/",
    ChannelProfileView.as_view(),
    name="channel-profile",
    ),
    path(
    'channels/join/<uuid:invite_code>/',
    ChannelJoinView.as_view(),
    name='channel-join'
    ),
    path(
        'channels/public/<str:public_id>/',
        ChannelPublicIdView.as_view(),
        name='channel-public-join'
    ),
    
]
