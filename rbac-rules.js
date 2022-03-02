const rules = {
  admin: [
    'basicMessages:create',
    'basicMessages:read',
    'contacts:create',
    'contacts:read',
    'contacts:update',
    'contacts:delete',
    'credentials:issue',
    'credentials:read',
    'credentials:reissue',
    'credentials:revoke',
    'demographics:create',
    'demographics:read',
    'demographics:update',
    'demographics:delete',
    'invitations:create',
    'invitations:read',
    'invitations:delete',
    'presentations:read',
    'roles:read',
    'settings:read',
    'settings:update',
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'users:updatePassword',
    'users:updateRoles',
  ],
  moderator: [
    'basicMessages:create',
    'basicMessages:read',
    'contacts:create',
    'contacts:read',
    'contacts:update',
    'credentials:issue',
    'credentials:read',
    'credentials:reissue',
    'credentials:revoke',
    'demographics:create',
    'demographics:read',
    'demographics:update',
    'invitations:create',
    'invitations:read',
    'presentations:read',
  ],
}

module.exports = rules