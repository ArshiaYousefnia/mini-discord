from rest_framework.permissions import BasePermission

class IsMessageOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.sender == request.user