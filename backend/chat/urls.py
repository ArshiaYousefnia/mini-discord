from django.urls import path, include
from rest_framework.routers import DefaultRouter

from chat.views.channel_topics_views import TopicListCreateView, TopicDetailView
from chat.views.channel_roles_views import ChannelRolesView, ChannelRoleDetailView

from chat.views.channel_views import ChannelCreateView, ChannelProfileView, ChannelJoinView, ChannelPublicIdView, \
    ChannelUpdateView, ChannelMembersListView, ChannelRemoveMemberView, ChannelMemberRoleUpdateView, ChannelDeleteView, \
    ChannelMyPermissionsView, ChannelPreviewView
from chat.views.group_views import GroupCreateView, GroupJoinView, GroupProfileView, GroupMembersView, GroupUpdateView, \
    GroupDeleteView

from chat.views.notification_views import NotificationListView, NotificationMarkReadView, NotificationMarkAllReadView, \
    UnreadNotificationCountView
from chat.views.message_schedule_views import ScheduledMessageCreateView, ScheduledMessageListView, ScheduledMessageDeleteView, \
    ScheduledMessageCancelAllView, ScheduledMessageRetryView
from chat.views.views import SendDirectMessageView, ConversationViewSet, MessageViewSet, ConversationListView, \
    ConversationMarkReadView, ChannelMemberRoleRemoveView, AttachmentDownloadView

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

    path(
        "channels/<uuid:conversation_id>/edit/",
        ChannelUpdateView.as_view(),
        name="channel-update",
    ),

    path(
        'channels/<uuid:conversation_id>/members/',
        ChannelMembersListView.as_view(),
        name='channel-members-list'
    ),

    path(
        'channels/<uuid:conversation_id>/members/<uuid:user_id>/',
        ChannelRemoveMemberView.as_view(),
        name='channel-remove-member'
    ),

    path(
        'channels/<uuid:conversation_id>/members/<uuid:user_id>/role/',
        ChannelMemberRoleUpdateView.as_view(),
        name='channel-member-role-update'
    ),
    path(
        "channels/<uuid:conversation_id>/delete/",
        ChannelDeleteView.as_view(),
        name="channel-delete",
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

    path(
        "channels/<uuid:conversation_id>/edit/",
        ChannelUpdateView.as_view(),
        name="channel-update",
    ),


    path(
        "channels/<uuid:conversation_id>/my-permissions/",
        ChannelMyPermissionsView.as_view(),
        name="channel-my-permissions",
    ),
    path(

        'channels/preview/<uuid:invite_code>/',
        ChannelPreviewView.as_view(),
        name='channel-preview'
    ),
    path(
        'channels/<uuid:conversation_id>/roles/',
        ChannelRolesView.as_view(),
        name='channel-roles',
    ),
    path(
        'channels/<uuid:conversation_id>/roles/<uuid:role_id>/',
        ChannelRoleDetailView.as_view(),
        name='channel-role-detail',
    ),
    path(
        'channels/<uuid:conversation_id>/topics/',
        TopicListCreateView.as_view(),
        name='topic-list-create',
    ),
    path(
        'channels/<uuid:conversation_id>/topics/<uuid:topic_id>/',
        TopicDetailView.as_view(),
        name='topic-detail',
    ),
    path(
        'attachments/<uuid:attachment_id>/download/',
        AttachmentDownloadView.as_view(),
        name='attachment-download',
    ),
    path(
        'channels/<uuid:conversation_id>/members/<uuid:user_id>/roles/<uuid:role_id>/',
        ChannelMemberRoleRemoveView.as_view(),
        name='channel-member-role-remove'
    ),
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<uuid:id>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
    path('notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('notifications/unread-count/', UnreadNotificationCountView.as_view(), name='notification-unread-count'),
    path(
        'conversations/<uuid:conversation_id>/schedule/',
        ScheduledMessageCreateView.as_view(),
        name='schedule-message'
    ),
    path(
        'scheduled-messages/',
        ScheduledMessageListView.as_view(),
        name='scheduled-messages-list'
    ),
    path(
        'scheduled-messages/<uuid:id>/',
        ScheduledMessageDeleteView.as_view(),
        name='scheduled-message-delete'
    ),
    path(
    'conversations/<uuid:conversation_id>/schedule/cancel-all/',
    ScheduledMessageCancelAllView.as_view(),
    name='schedule-cancel-all'
    ),
    path('scheduled-messages/<uuid:id>/retry/', ScheduledMessageRetryView.as_view(), name='scheduled-message-retry'),
]
