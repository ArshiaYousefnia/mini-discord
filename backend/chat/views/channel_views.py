from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from chat.models import Conversation, ConversationMember, Channel, Role, Message
from chat.serializers import ChannelCreateSerializer, ChannelDetailSerializer, ChannelUpdateSerializer, \
    ChannelMemberSerializer, ChannelMemberRoleUpdateSerializer, MessageSerializer
from chat.views.views_realtime_utils import broadcast_conversation_update, broadcast_conversation_metadata_update


class ChannelCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ChannelCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()

        # Retrieve the channel profile for invite link
        channel = conversation.channel
        invite_link = request.build_absolute_uri(
            f'/api/chat/invite/{channel.invite_code}/'
        )
        # Or you may want a frontend deep link; adjust as needed.

        return Response(
            {
                'id': conversation.id,
                'name': conversation.name,
                'description': conversation.description,
                'avatar_url': conversation.avatar_url,
                'is_private': channel.is_private,
                'public_id': channel.public_id,
                'invite_link': invite_link,
                'owner_id': request.user.id,
            },
            status=status.HTTP_201_CREATED
        )


class ChannelProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):

        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )

        if not ConversationMember.objects.filter(
            conversation=conversation,
            user=request.user,
        ).exists():
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ChannelDetailSerializer(
            conversation,
            context={"request": request},
        )

        return Response(serializer.data)


class ChannelJoinView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invite_code):

        try:
            channel = Channel.objects.select_related('conversation').get(invite_code=invite_code)
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Invalid link."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        return Response({
            "name": conversation.name,
            "avatar_url": conversation.avatar_url,
            "description": conversation.description,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, invite_code):

        try:
            channel = Channel.objects.select_related('conversation').get(invite_code=invite_code)
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Invalid link."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        user = request.user

        if ConversationMember.objects.filter(conversation=conversation, user=user).exists():
            return Response(
                {"detail": "You are already a member of this channel."},
                status=status.HTTP_400_BAD_REQUEST
            )

        role, _ = Role.objects.get_or_create(
            conversation=conversation,
            name='Channel Member',
            defaults={
                'can_send_messages': False,
                'can_send_media': False,
                'can_delete_messages': False,
                'can_manage_members': False,
                'can_manage_roles': False,
                'can_view_invite_link':False,
                'can_edit_channel_info':False,
                'can_delete_channel':False,
            }
        )

        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        # After adding member
        broadcast_conversation_update(
            conversation,
            'member_joined',
            {'user_id': str(user.id)}
        )

        serializer = ChannelDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChannelPublicIdView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, public_id):

        try:
            channel = Channel.objects.select_related('conversation').get(
                public_id=public_id,
                is_private=False
            )
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Channel not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        return Response({
            "id": conversation.id,
            "name": conversation.name,
            "avatar_url": conversation.avatar_url,
            "description": conversation.description,
            "public_id": channel.public_id,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, public_id):

        try:
            channel = Channel.objects.select_related('conversation').get(
                public_id=public_id,
                is_private=False
            )
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Channel not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation
        user = request.user

        if ConversationMember.objects.filter(conversation=conversation, user=user).exists():
            return Response(
                {"detail": "You are already a member of this channel."},
                status=status.HTTP_400_BAD_REQUEST
            )

        role, _ = Role.objects.get_or_create(
            conversation=conversation,
            name='Channel Member',
            defaults={
                'can_send_messages': False,
                'can_send_media': False,
                'can_delete_messages': False,
                'can_manage_members': False,
                'can_manage_roles': False,
                'can_view_invite_link':True,
                'can_edit_channel_info':True
            }
        )

        member = ConversationMember.objects.create(conversation=conversation, user=user)
        member.roles.add(role)

        serializer = ChannelDetailSerializer(conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChannelUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )

        try:
            member = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        can_edit_channel = member.roles.filter(can_edit_channel_info=True).exists()

        if not (can_edit_channel):
            return Response(
                {"detail": "You do not have permission to edit this channel's info."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ChannelUpdateSerializer(
            conversation,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        broadcast_conversation_metadata_update(conversation)

        # Broadcast channel info update to all members
        broadcast_conversation_update(
            conversation,
            'channel_updated',
            {
                'name': conversation.name,
                'description': conversation.description,
                'avatar_url': conversation.avatar_url
            }
        )

        detail_serializer = ChannelDetailSerializer(conversation, context={"request": request})
        return Response(detail_serializer.data, status=status.HTTP_200_OK)


class ChannelMembersListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL,
        )

        try:
            requesting_member = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_owner = (conversation.owner == request.user)
        can_manage = requesting_member.roles.filter(can_manage_members=True).exists()
        if not (is_owner or can_manage):
            return Response(
                {"detail": "You do not have permission to view the members list."},
                status=status.HTTP_403_FORBIDDEN,
            )

        members = ConversationMember.objects.filter(
            conversation=conversation
        ).select_related('user')
        members.prefetch_related('roles')

        serializer = ChannelMemberSerializer(members, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChannelRemoveMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id, user_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            requester_membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage = requester_membership.roles.filter(can_manage_members=True).exists()
        if not (is_owner or can_manage):
            return Response(
                {"detail": "You do not have permission to remove users."},
                status=status.HTTP_403_FORBIDDEN
            )

        if conversation.owner and str(conversation.owner.id) == str(user_id):
            return Response(
                {"detail": "The channel owner cannot be removed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if str(request.user.id) == str(user_id):
            return Response(
                {"detail": "You cannot kick yourself. Please use the leave option."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_membership = ConversationMember.objects.get(
                conversation=conversation,
                user_id=user_id
            )
            target_membership.delete()

            # After removing member
            broadcast_conversation_update(
                conversation,
                'member_left',
                {'user_id': str(user_id)}
            )

            return Response(status=status.HTTP_204_NO_CONTENT)

        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "User is not a member of this channel."},
                status=status.HTTP_404_NOT_FOUND
            )


class ChannelMemberRoleUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, conversation_id, user_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            requester_membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)
        can_manage_roles = requester_membership.roles.filter(can_manage_roles=True).exists()

        if not (is_owner or can_manage_roles):
            return Response(
                {"detail": "You do not have permission to manage roles."},
                status=status.HTTP_403_FORBIDDEN
            )

        if conversation.owner and str(conversation.owner.id) == str(user_id):
            return Response(
                {"detail": "You cannot change the role of the channel owner."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            target_membership = ConversationMember.objects.get(
                conversation=conversation,
                user_id=user_id
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "Target user is not a member of this channel."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ChannelMemberRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role_id = serializer.validated_data['role_id']

        try:
            role = Role.objects.get(id=role_id, conversation=conversation)
        except Role.DoesNotExist:
            return Response(
                {"detail": "Role not found in this channel."},
                status=status.HTTP_404_NOT_FOUND
            )

        target_membership.roles.add(role)

        # Broadcast role update to all members
        broadcast_conversation_update(
            conversation,
            'role_updated',
            {
                'user_id': str(target_membership.user_id),
                'role_ids': [str(r.id) for r in target_membership.roles.all()],
                'action': 'add'
            }
        )

        return Response(
            {"detail": "Role updated successfully."},
            status=status.HTTP_200_OK
        )


class ChannelDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        conversation = get_object_or_404(Conversation, id=conversation_id)
        if conversation.type != Conversation.Type.CHANNEL:
            return Response({"detail": "Not a channel."}, status=status.HTTP_404_NOT_FOUND)

        try:
            membership = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )
        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_owner = (conversation.owner == request.user)

        can_delete = membership.roles.filter(Q(can_delete_channel=True) | Q(can_manage_roles=True)).exists()
        if not (is_owner or can_delete):
            return Response(
                {"detail": "You do not have permission to delete this channel."},
                status=status.HTTP_403_FORBIDDEN
            )

        conversation.delete()

        return Response(
            {"detail": "Channel deleted successfully."},
            status=status.HTTP_204_NO_CONTENT
        )


class ChannelMyPermissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(
            Conversation,
            id=conversation_id,
            type=Conversation.Type.CHANNEL
        )

        permissions = {
            "is_owner": False,
            "can_send_messages": False,
            "can_send_media": False,
            "can_delete_messages": False,
            "can_manage_members": False,
            "can_manage_roles": False,
            "can_view_invite_link": False,
            "can_edit_channel_info": False,
            "can_delete_channel": False,
            "can_create_topic": False,
            "can_manage_others_topics": False,
        }

        if conversation.owner == request.user:
            for key in permissions.keys():
                permissions[key] = True
            return Response(permissions, status=status.HTTP_200_OK)

        try:
            member = ConversationMember.objects.prefetch_related('roles').get(
                conversation=conversation,
                user=request.user
            )

            roles = member.roles.all()

            permissions = {
                "is_owner": False, # یا بررسی منطق مالکیت مانند: member.is_owner
                "can_send_messages": any(r.can_send_messages for r in roles),
                "can_send_media": any(r.can_send_media for r in roles),
                "can_delete_messages": any(r.can_delete_messages for r in roles),
                "can_manage_members": any(r.can_manage_members for r in roles),
                "can_manage_roles": any(r.can_manage_roles for r in roles),
                "can_view_invite_link": any(r.can_view_invite_link for r in roles),
                "can_edit_channel_info": any(r.can_edit_channel_info for r in roles),
                "can_delete_channel": any(r.can_delete_channel for r in roles),
                "can_create_topic": any(r.can_create_topic for r in roles),
                "can_manage_others_topics": any(r.can_manage_others_topics for r in roles),
            }

            return Response(permissions, status=status.HTTP_200_OK)

        except ConversationMember.DoesNotExist:
            return Response(
                {"detail": "You are not a member of this channel."},
                status=status.HTTP_403_FORBIDDEN
            )


class ChannelPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invite_code):
        try:
            channel = Channel.objects.select_related('conversation').get(invite_code=invite_code)
        except Channel.DoesNotExist:
            return Response(
                {"detail": "Invalid invite link or channel does not exist."},
                status=status.HTTP_404_NOT_FOUND
            )

        conversation = channel.conversation

        messages = Message.objects.filter(
            conversation=conversation,
            is_deleted=False
        ).select_related('sender').order_by('created_at')

        message_serializer = MessageSerializer(messages, many=True, context={'request': request})

        preview_data = {
            "id": conversation.id,
            "name": conversation.name,
            "description": conversation.description,
            "avatar_url": conversation.avatar_url,
            "is_private": channel.is_private,
            "public_id": channel.public_id,
            "messages": message_serializer.data,
        }

        return Response(preview_data, status=status.HTTP_200_OK)
