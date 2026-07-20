import React, { useState, useEffect } from 'react';
import { TrashIcon, ChevronLeftIcon } from '@heroicons/react/24/solid';
import { deleteChannelRole, updateChannelRole, type ChannelRole, type RolePermissions } from '../services/channelService';

const PERMISSION_LABELS: { key: keyof RolePermissions; label: string }[] = [
  { key: 'can_send_messages', label: 'Send Message (include Edit/Delete Own, Media & Files)' },
  { key: 'can_delete_messages', label: 'Delete Others Messages' },
  { key: 'can_view_invite_link', label: 'View Invite Link' },
  { key: 'can_edit_channel_info', label: 'Edit Channel Info' },
  { key: 'can_delete_channel', label: 'Delete Channel' },
  { key: 'can_create_topic', label: 'Create Topic (include Edit/Delete Own)' },
  { key: 'can_manage_others_topics', label: 'Manage Others Topics (Edit/Delete)' },
  { key: 'can_manage_members', label: 'Manage Members' },
];

interface RoleManagementProps {
  channelId: string;
  isOwner: boolean;
  roles: ChannelRole[];
}

export default function RoleManagement({ channelId, isOwner, roles: initialRoles }: RoleManagementProps) {
  // Initialize local state with the roles passed from ChatView -> ProfileOverlay
  const [roles, setRoles] = useState<ChannelRole[]>(initialRoles || []);
  const [selectedRole, setSelectedRole] = useState<ChannelRole | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Partial<RolePermissions>>({});
  const [loading, setLoading] = useState(false);

  // Sync local state if the parent passes down new roles (e.g., after creating a new role)
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
    try {
      const updatedRole = await updateChannelRole(
        channelId, 
        selectedRole.id, 
        editingPermissions
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

  if (!isOwner) return <div className="no-permissions">Only the owner can manage roles.</div>;

  // VIEW 2: EDITING A ROLE
  if (selectedRole) {
    return (
      <div className="role-management-edit">
        <div className="role-edit-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => setSelectedRole(null)} 
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 0 }}
          >
            <ChevronLeftIcon style={{ width: 24, height: 24 }} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Edit Role: {selectedRole.name}</h2>
        </div>

        <div className="role-permissions-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {PERMISSION_LABELS.map(({ key, label }) => (
            <label key={key} className="permission-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={!!editingPermissions[key]}
                onChange={() => handleTogglePermission(key)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </label>
          ))}
        </div>

        <div className="role-edit-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => setSelectedRole(null)}
            style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSavePermissions} 
            disabled={loading}
            style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  // VIEW 1: ROLE LIST
  return (
    <div className="role-management-list-view">
      <div className="roles-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {roles.map(role => (
          <div 
            key={role.id}
            onClick={() => {
              setSelectedRole(role);
              setEditingPermissions(role);
            }}
            className="role-list-item"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', cursor: 'pointer' }}
          >
            <span>{role.name}</span>
            {role.name !== 'Channel Owner' && (
              <button
                onClick={(e) => handleDeleteRole(e, role.id)}
                title="Delete Role"
                style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
              >
                <TrashIcon style={{ width: 20, height: 20 }} />
              </button>
            )}
          </div>
        ))}
        {roles.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No custom roles found.</p>}
      </div>
    </div>
  );
}
