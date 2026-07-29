import React, { useState, useEffect } from 'react';
import { TrashIcon, ChevronLeftIcon } from '@heroicons/react/24/solid';
import { deleteChannelRole, updateChannelRole, type ChannelRole, type RolePermissions } from '../services/channelService';

const PERMISSION_LABELS: { key: keyof RolePermissions; label: string }[] = [
  { key: 'can_send_messages', label: 'Send Message' },
  { key: 'can_delete_messages', label: 'Delete Others Messages' },
  { key: 'can_view_invite_link', label: 'View Invite Link' },
  { key: 'can_edit_channel_info', label: 'Edit Channel Info' },
  { key: 'can_delete_channel', label: 'Delete Channel' },
  { key: 'can_create_topic', label: 'Create Topic' },
  { key: 'can_manage_others_topics', label: 'Manage Others Topics' },
  { key: 'can_manage_members', label: 'Manage Members' },
];

interface RoleManagementProps {
  channelId: string;
  isOwner: boolean;
  roles: ChannelRole[];
}

export default function RoleManagement({ channelId, isOwner, roles: initialRoles }: RoleManagementProps) {
  const [roles, setRoles] = useState<ChannelRole[]>(initialRoles || []);
  const [selectedRole, setSelectedRole] = useState<ChannelRole | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Partial<RolePermissions>>({});
  const [editingName, setEditingName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRoles(initialRoles || []);
  }, [initialRoles]);

  const handleDeleteRole = async (e: React.MouseEvent, roleId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    
    try {
      await deleteChannelRole(channelId, roleId);
      setRoles(prevRoles => prevRoles.filter(r => r.id !== roleId));
      if (selectedRole?.id === roleId) setSelectedRole(null);
    } catch (error) {
      console.error('Failed to delete role', error);
      alert('Failed to delete role.');
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    setLoading(true);

    const isSystemRole =
      selectedRole.name === 'Channel Owner' ||
      selectedRole.name === 'Channel Member' ||
      selectedRole.name === 'Member';

    try {
      const payload = {
        ...editingPermissions,
        ...(isSystemRole ? {} : { name: editingName.trim() || selectedRole.name }),
      };

      const updatedRole = await updateChannelRole(
        channelId, 
        selectedRole.id, 
        payload
      );
      setRoles(prevRoles => prevRoles.map(r => r.id === updatedRole.id ? updatedRole : r));
      setSelectedRole(null);
    } catch (error) {
      console.error('Failed to update permissions', error);
      alert('Failed to save permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (key: keyof RolePermissions) => {
    setEditingPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!isOwner) return <div style={{ padding: '16px', color: 'gray' }}>Only the owner can manage roles.</div>;

  // VIEW: EDITING A ROLE
  if (selectedRole) {
    const isSystemRole =
      selectedRole.name === 'Channel Owner' ||
      selectedRole.name === 'Channel Member' ||
      selectedRole.name === 'Member';

    return (
      <div className="role-edit-view">
        <div className="role-edit-header" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <button 
              onClick={() => setSelectedRole(null)} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
            >
              <ChevronLeftIcon style={{ width: '24px', height: '24px', color: 'var(--md-sys-color-text-secondary)' }} />
            </button>

            {isSystemRole ? (
              <h2 className="role-edit-title" style={{ margin: 0 }}>
                Edit Role: {selectedRole.name}
              </h2>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                <label style={{ fontSize: '12px', color: 'var(--md-sys-color-text-secondary)' }}>
                  Role Name
                </label>
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="Enter role name"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--md-sys-color-outline)',
                    background: 'transparent',
                    color: 'var(--md-sys-color-text-primary)',
                    fontSize: '15px',
                    fontWeight: '500',
                    outline: 'none',
                    width: '100%',
                    maxWidth: '300px',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="permissions-container">
          {PERMISSION_LABELS.map(({ key, label }) => (
            <label key={key} className="permission-item" style={{ cursor: 'pointer' }}>
              <div className="permission-label-group">
                <span className="permission-title">{label}</span>
              </div>
              <input
                type="checkbox"
                checked={!!editingPermissions[key]}
                onChange={() => handleTogglePermission(key)}
                className="permission-checkbox"
              />
            </label>
          ))}
        </div>

        <div className="role-edit-actions">
          <button 
            onClick={() => setSelectedRole(null)}
            style={{
              background: 'transparent', border: '1px solid var(--md-sys-color-outline)',
              color: 'var(--md-sys-color-text-primary)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSavePermissions} 
            disabled={loading}
            className="create-role-btn"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  // VIEW: ROLE LIST
  return (
    <div className="roles-management-section">
      <div className="roles-list">
        {roles.map(role => {
          const isOwnerRole = role.name === 'Channel Owner';
          const isSystemRole =
            role.name === 'Channel Owner' ||
            role.name === 'Channel Member' ||
            role.name === 'Member';

          return (
            <div 
              key={role.id}
              onClick={() => {
                if (isOwnerRole) return; // Prevent opening edit view for Channel Owner
                setSelectedRole(role);
                setEditingPermissions(role);
                setEditingName(role.name);
              }}
              className="role-row"
              style={{
                cursor: isOwnerRole ? 'default' : 'pointer',
                opacity: isOwnerRole ? 0.6 : 1,
              }}
            >
              <span className="role-name">
                {role.name}
                {isOwnerRole && (
                  <span
                    style={{
                      marginLeft: '8px',
                      fontSize: '12px',
                      color: 'var(--md-sys-color-text-secondary)',
                      fontStyle: 'italic',
                    }}
                  >
                    (Uneditable)
                  </span>
                )}
              </span>
              {!isSystemRole && (
                <button
                  onClick={(e) => handleDeleteRole(e, role.id)}
                  title="Delete Role"
                  className="role-delete-btn"
                >
                  <TrashIcon style={{ width: '20px', height: '20px' }} />
                </button>
              )}
            </div>
          );
        })}
        {roles.length === 0 && <p className="no-roles-msg">No custom roles found.</p>}
      </div>
    </div>
  );
}
