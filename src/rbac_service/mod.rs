// src/rbac_service/mod.rs
use serde::{Deserialize, Serialize};
use std::collections::HashSet; // For efficient permission lookups
use worker::console_log;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub enum Role {
    User,
    Admin,
    // Potentially other roles like Moderator, PremiumUser, etc.
}

pub struct RBACService {
    // In the future, this might hold configurations or D1 bindings if roles/permissions are dynamic
}

impl RBACService {
    pub fn new() -> Self {
        RBACService {}
    }

    pub fn check_permission(&self, user_roles: &[Role], command: &str) -> bool {
        // console_log!("[RBACService] Checking permission for command '{}' with roles: {:?}", command, user_roles); // Can be verbose

        if user_roles.contains(&Role::Admin) {
            // console_log!("[RBACService] Admin role found. Permission granted.");
            return true;
        }

        let user_allowed_commands: HashSet<&str> = [
            "/start",
            "/find_match",
            "/profile",
            "/help",
            // "/feedback", // Example, if added later
        ].iter().cloned().collect();

        if user_roles.contains(&Role::User) {
            let has_permission = user_allowed_commands.contains(command);
            // console_log!("[RBACService] User role found. Permission for '{}': {}", command, has_permission);
            return has_permission;
        }

        // console_log!("[RBACService] No matching roles or permissions. Permission denied for command '{}'.", command);
        false
    }

    pub fn is_admin_command(&self, command: &str) -> bool {
        let admin_commands: HashSet<&str> = [
            "/admin_settings",
            "/view_users",
            "/bot_status",
        ].iter().cloned().collect();
        admin_commands.contains(command)
    }
}

impl Default for RBACService {
    fn default() -> Self {
        Self::new()
    }
}


#[cfg(test)]
mod tests {
    use super::*; // Import items from outer module (RBACService, Role)

    #[test]
    fn test_check_permission_admin_has_all_permissions() {
        let rbac = RBACService::new();
        let admin_roles = vec![Role::Admin];

        assert!(rbac.check_permission(&admin_roles, "/start"), "Admin should have /start permission");
        assert!(rbac.check_permission(&admin_roles, "/find_match"), "Admin should have /find_match permission");
        assert!(rbac.check_permission(&admin_roles, "/profile"), "Admin should have /profile permission");
        assert!(rbac.check_permission(&admin_roles, "/help"), "Admin should have /help permission");
        assert!(rbac.check_permission(&admin_roles, "/admin_settings"), "Admin should have /admin_settings permission");
        assert!(rbac.check_permission(&admin_roles, "/view_users"), "Admin should have /view_users permission");
        assert!(rbac.check_permission(&admin_roles, "/bot_status"), "Admin should have /bot_status permission");
        assert!(rbac.check_permission(&admin_roles, "/some_undefined_command"), "Admin should have permission for any command");
    }

    #[test]
    fn test_check_permission_user_has_defined_permissions() {
        let rbac = RBACService::new();
        let user_roles = vec![Role::User];

        // Allowed commands
        assert!(rbac.check_permission(&user_roles, "/start"), "User should have /start permission");
        assert!(rbac.check_permission(&user_roles, "/find_match"), "User should have /find_match permission");
        assert!(rbac.check_permission(&user_roles, "/profile"), "User should have /profile permission");
        assert!(rbac.check_permission(&user_roles, "/help"), "User should have /help permission");

        // Disallowed commands (admin or undefined)
        assert!(!rbac.check_permission(&user_roles, "/admin_settings"), "User should NOT have /admin_settings permission");
        assert!(!rbac.check_permission(&user_roles, "/view_users"), "User should NOT have /view_users permission");
        assert!(!rbac.check_permission(&user_roles, "/bot_status"), "User should NOT have /bot_status permission");
        assert!(!rbac.check_permission(&user_roles, "/some_undefined_command"), "User should NOT have permission for undefined command");
    }

    #[test]
    fn test_check_permission_user_with_admin_role_is_admin() {
        let rbac = RBACService::new();
        let user_admin_roles = vec![Role::User, Role::Admin];

        assert!(rbac.check_permission(&user_admin_roles, "/start"), "User+Admin should have /start permission");
        assert!(rbac.check_permission(&user_admin_roles, "/admin_settings"), "User+Admin should have /admin_settings permission");
        assert!(rbac.check_permission(&user_admin_roles, "/some_undefined_command"), "User+Admin should have permission for any command");
    }

    #[test]
    fn test_check_permission_no_roles_has_no_permissions() {
        let rbac = RBACService::new();
        let no_roles: Vec<Role> = vec![];

        assert!(!rbac.check_permission(&no_roles, "/start"), "No roles should NOT have /start permission");
        assert!(!rbac.check_permission(&no_roles, "/admin_settings"), "No roles should NOT have /admin_settings permission");
        assert!(!rbac.check_permission(&no_roles, "/some_undefined_command"), "No roles should NOT have permission for undefined command");
    }

    #[test]
    fn test_is_admin_command_positive_cases() {
        let rbac = RBACService::new();
        assert!(rbac.is_admin_command("/admin_settings"));
        assert!(rbac.is_admin_command("/view_users"));
        assert!(rbac.is_admin_command("/bot_status"));
    }

    #[test]
    fn test_is_admin_command_negative_cases() {
        let rbac = RBACService::new();
        assert!(!rbac.is_admin_command("/start"));
        assert!(!rbac.is_admin_command("/profile"));
        assert!(!rbac.is_admin_command("admin_settings")); // Missing slash
        assert!(!rbac.is_admin_command("/adminSettings")); // Case sensitivity
    }
}
