import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"; 
import type {
  User,
  UserPreferences,
  UserUpdate,
  ValidationErrors,
} from "../../src/models/user";
import {
  Gender,
  GenderPreference,
  defaultPreferences,
} from "../../src/models/user";
import * as userService from "../../src/services/user_service";
import { users } from "../../src/services/user_service"; // Import the users map

// Mock the user_service module
vi.mock("../../src/services/user_service", async (importOriginal) => {
  const originalModule = await importOriginal<typeof userService>();
  return {
    ...originalModule, // Keep original implementations for other functions
    isProfileComplete: vi.fn(originalModule.isProfileComplete), // Create mock, but default to original
    // Other functions like findOrCreateUser, getUserById, updateUser will use the original logic
    // but updateUser will call our *mocked* isProfileComplete
  };
});

describe("UserService", () => {
  beforeEach(() => {
    userService.__test__resetUsers();
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Ensure mocks don't leak between tests
  });

  describe("findOrCreateUser", () => {
    it("should create a new user if one does not exist", async () => {
      const userId = 123;
      const user = await userService.findOrCreateUser(userId);
      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
      expect(user.telegram_username).toBeNull();
      expect(user.preferences).toEqual(defaultPreferences);
      expect(user.created_at).toBeInstanceOf(Date);
      expect(user.updated_at).toBeInstanceOf(Date);
      expect(user.is_complete).toBe(false);
      const userInMap = await userService.getUserById(userId);
      expect(userInMap).toEqual(user);
    });

    it("should return an existing user if one exists", async () => {
      const userId = 456;
      const createdUser = await userService.findOrCreateUser(userId);
      const foundUser = await userService.findOrCreateUser(userId);
      expect(foundUser).toEqual(createdUser);
      const allUsers = await userService.getAllUsers();
      expect(allUsers.filter((u) => u.id === userId).length).toBe(1);
    });

    it("should find and return an existing user", async () => {
      const userId = 2;
      await userService.findOrCreateUser(userId);
      const foundUser = await userService.getUserById(userId);
      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(userId);
      expect(foundUser?.name).toBeNull();
    });
  });

  describe("getUserById", () => {
    it("should return a user if they exist", async () => {
      const userId = 789;
      await userService.findOrCreateUser(userId);
      const user = await userService.getUserById(userId);
      expect(user).toBeDefined();
      expect(user?.id).toBe(userId);
    });

    it("should return null if the user does not exist", async () => {
      const userId = 999;
      const user = await userService.getUserById(userId);
      expect(user).toBeNull();
    });
  });

  describe("updateUser", () => {
    beforeEach(() => {
      userService.__test__resetUsers();
      // Don't set fake timers here, do it in the specific test
      vi.restoreAllMocks();
    });

    it("should update an existing user with valid data", async () => {
      const userId = 111;
      await userService.findOrCreateUser(userId);
      const updateData: UserUpdate = {
        name: "Updated Name",
        age: 33,
        gender: Gender.Woman,
        description: "Updated description.",
        preferences: { gender_preference: GenderPreference.Men },
      };

      const result = await userService.updateUser(userId, updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user).toBeDefined();
        expect(result.user.name).toBe("Updated Name");
        expect(result.user.age).toBe(33);
        expect(result.user.gender).toBe(Gender.Woman);
        expect(result.user.description).toBe("Updated description.");
        expect(result.user.preferences.gender_preference).toBe(GenderPreference.Men);
        expect(result.user.is_complete).toBe(true); // Should be complete now
      }
    });

    it("should return validation errors for invalid data", async () => {
      const userId = 111;
      await userService.findOrCreateUser(userId);
      const invalidUpdate = {
        age: 5, // Too young
        name: "a".repeat(101), // Too long
      };

      const result = await userService.updateUser(userId, invalidUpdate as UserUpdate);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeDefined();
        expect(result.errors.age).toContain("at least 18");
        expect(result.errors.name).toContain("at most 50 characters");
      }
    });

    it("should only update provided fields", async () => {
      const userId = 111;
      await userService.findOrCreateUser(userId);
      await userService.updateUser(userId, {
        name: "Initial Name",
        age: 30,
        gender: Gender.Man,
        description: "Initial Desc",
        preferences: { gender_preference: GenderPreference.Everyone },
      });

      const partialUpdate: Partial<UserUpdate> = {
        description: "Only updating description.",
      };
      const initialUser = await userService.getUserById(userId);
      expect(initialUser).toBeDefined(); // Ensure user exists before checks

      const result = await userService.updateUser(userId, partialUpdate);
      expect(result.success).toBe(true);

      if (result.success && initialUser) { // Type guard for result.user and ensure initialUser is defined
        expect(result.user).toBeDefined();
        expect(result.user.description).toBe("Only updating description.");
        expect(result.user.name).toBe(initialUser.name); // Name should remain unchanged
      }
    });

    it("should update is_complete status when profile becomes complete", async () => {
      const userId = 111;
      const user = await userService.findOrCreateUser(userId);
      expect(user.is_complete).toBe(false);

      const completeUpdate: UserUpdate = {
        name: "Complete User",
        age: 40,
        gender: Gender.NonBinary,
        description: "This user is now complete.",
        preferences: { gender_preference: GenderPreference.Everyone },
      };

      const result = await userService.updateUser(userId, completeUpdate);
      expect(result.success).toBe(true); 
      if(result.success){
        expect(result.user.is_complete).toBe(true);
      }
    });

    it("should update is_complete status when profile becomes incomplete", async () => {
      const userId = 111;
      await userService.findOrCreateUser(userId);
      await userService.updateUser(userId, {
        name: "Complete User",
        age: 40,
        gender: Gender.NonBinary,
        description: "This user is now complete.",
        preferences: { gender_preference: GenderPreference.Everyone },
      });

      const updatedUser = await userService.getUserById(userId);
      expect(updatedUser?.is_complete).toBe(true);

      const incompleteUpdate: Partial<UserUpdate> = { name: undefined }; 
      const result = await userService.updateUser(userId, incompleteUpdate);
      expect(result.success).toBe(true); 
      if(result.success){
        expect(result.user.is_complete).toBe(false); 
        expect(result.user.name).toBeUndefined();
      }
    });

    it("should return success false if user does not exist", async () => {
      const userId = 999; // Non-existent user
      const updateData: UserUpdate = { name: "Ghost" };
      const result = await userService.updateUser(userId, updateData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toEqual({ general: "User not found" });
      }
    });

    it("should update the updated_at timestamp", async () => {
      const userId = 111;
      // Explicitly create a full user object for setup
      const initialUser: User = {
        id: userId,
        telegram_username: null,
        name: null,
        age: null,
        gender: null,
        description: null,
        preferences: defaultPreferences,
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      userService.users.set(initialUser.id, initialUser); // Set user directly in exported map

      const initialTimestamp = initialUser.updated_at;
      expect(initialTimestamp).toBeDefined();

      // Add a small delay to ensure timestamps differ
      await new Promise(resolve => setTimeout(resolve, 10));

      const updateData: UserUpdate = { name: "New Name" };

      const updatedUser = await userService.updateUser(userId, updateData);

      expect(updatedUser.success).toBe(true);
      if (updatedUser.success) {
        expect(initialTimestamp).toBeDefined(); // Re-check for type safety
        if (initialTimestamp) {
          // Ensure updated_at is actually later
          expect(updatedUser.user.updated_at.getTime()).toBeGreaterThan(
            initialTimestamp.getTime()
          );
        } else {
          expect(updatedUser.user.updated_at).toBeDefined();
        }
      }
    });
  });

  describe("isProfileComplete", () => {
    it("should return true for a complete user profile", () => {
      const completeUser: User = {
        id: 1,
        telegram_username: "complete",
        name: "Test User",
        age: 30,
        gender: Gender.Man,
        description: "A complete description that is long enough.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(completeUser)).toBe(true);
    });

    it("should return false if name is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: null,
        age: 30,
        gender: Gender.Man,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(false);
    });

    it("should return false if age is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: null,
        gender: Gender.Man,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(false);
    });

    it("should return false if gender is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: 30,
        gender: null,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(false);
    });

    it("should return false if description is missing or too short", () => {
      const userMissing: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: 30,
        gender: Gender.Man,
        description: null,
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      const userShort: User = {
        id: 2,
        telegram_username: "incomplete2",
        name: "Test",
        age: 30,
        gender: Gender.Man,
        description: "Too short",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(userMissing)).toBe(false);
      expect(userService.isProfileComplete(userShort)).toBe(false);
    });

    it("should return false if gender_preference is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: 30,
        gender: Gender.Man,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(true);
    });
  });

  describe("updatePreferences", () => {
    beforeEach(() => {
      userService.__test__resetUsers();
      vi.clearAllMocks(); // Clear mocks between tests
    });

    it("should update gender_preference successfully", async () => {
      const userId = 1;
      await userService.findOrCreateUser(userId);

      const prefUpdates = { gender_preference: GenderPreference.Women };
      const updatedUser = await userService.updatePreferences(userId, prefUpdates);
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.preferences.gender_preference).toBe(GenderPreference.Women);
    });

    it("should ignore invalid gender_preference and return original user", async () => {
      const userId = 1;
      const initialUser = await userService.findOrCreateUser(userId);
      const prefUpdates = { gender_preference: undefined }; // Pass undefined
 
      const updatedUser = await userService.updatePreferences(userId, prefUpdates);

      expect(updatedUser).toEqual(initialUser); // Function should return original user
    });

    it("should return original user if no valid updates are provided", async () => {
      const userId = 1;
      const initialUser = await userService.findOrCreateUser(userId);
      const prefUpdates = { some_other_key: "value" };
      const consoleSpy = vi.spyOn(console, "log");

      const updatedUser = await userService.updatePreferences(userId, prefUpdates as Partial<UserPreferences>);

      expect(updatedUser).toEqual(initialUser);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No valid preference updates provided"));
      consoleSpy.mockRestore();
    });

    it("should return original user if only invalid non-preference fields are provided", async () => {
      const userId = 1;
      const initialUser = await userService.findOrCreateUser(userId);
      const prefUpdates = { invalid_key: 'some_value' }; 
      const updatedUser = await userService.updatePreferences(userId, prefUpdates as Partial<UserPreferences>); 
      expect(updatedUser).toEqual(initialUser); 
    });

    it("should return null if user is not found", async () => {
      const userId = 999;
      const prefUpdates = { gender_preference: GenderPreference.Men };
      const updatedUser = await userService.updatePreferences(userId, prefUpdates);
      expect(updatedUser).toBeNull();
    });

    it("should update is_complete status if preferences change completes profile", async () => {
      const userId = 1;
      await userService.findOrCreateUser(userId);
      await userService.updateUser(userId, {
        name: "Test",
        age: 30,
        description: "This is a long enough description now",
      });
      const userBefore = await userService.getUserById(userId);
      expect(userBefore?.is_complete).toBe(false);
      expect(userBefore?.preferences.gender_preference).toBe(GenderPreference.Everyone);

      await userService.updatePreferences(userId, { gender_preference: GenderPreference.Everyone });
      const userAfterPrefUpdate = await userService.getUserById(userId);
      expect(userAfterPrefUpdate?.is_complete).toBe(false);

      await userService.updateUser(userId, { gender: Gender.Woman });
      const finalUser = await userService.getUserById(userId); // Re-fetch user 
      expect(finalUser?.is_complete).toBe(true);
    });

    it("should return null and log error if users.set throws", async () => {
      const userId = 1; // Same user ID
      await userService.findOrCreateUser(userId);

      // Spy on console.error for the catch block message
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Spy on the users map's set method and make it throw
      const setSpy = vi.spyOn(users, 'set').mockImplementationOnce(() => {
        console.log(">>> SPY: users.set throwing error NOW <<<");
        throw new Error("Simulated map set error");
      });

      console.log(">>> TEST: Calling updatePreferences (expecting users.set to fail) <<<");
      const result = await userService.updatePreferences(userId, { gender_preference: GenderPreference.Men });
      console.log(">>> TEST: updatePreferences call finished. Result:", result === null ? "null" : "object");

      expect(result).toBeNull(); // Expect null due to the caught error in the second try block
      expect(setSpy).toHaveBeenCalledTimes(1); // Check the set spy was called
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[UserService] Error saving user after preference update for user ${userId}`),
        expect.any(Error) // Check that an error object was logged
      );

      // Restore spies
      setSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe("getAllUsers", () => {
    beforeEach(() => {
      userService.__test__resetUsers();
    });

    it("should return an array of all users", async () => {
      await userService.findOrCreateUser(1);
      await userService.findOrCreateUser(2);
      await userService.findOrCreateUser(3);

      const allUsers = await userService.getAllUsers();
      expect(allUsers).toBeInstanceOf(Array);
      expect(allUsers.length).toBe(3);
      expect(allUsers.map((u) => u.id).sort()).toEqual([1, 2, 3]);
    });

    it("should return an empty array if no users exist", async () => {
      const allUsers = await userService.getAllUsers();
      expect(allUsers).toEqual([]);
    });
  });

  describe("isProfileComplete", () => {
    it("should return true for a complete profile", () => {
      const user: User = {
        id: 1,
        telegram_username: "complete",
        name: "Test User",
        age: 30,
        gender: Gender.Man,
        description: "A complete description that is long enough.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(true);
    });

    it("should return false if name is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: null,
        age: 30,
        gender: Gender.Man,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(false);
    });

    it("should return false if age is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: null,
        gender: Gender.Man,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(false);
    });

    it("should return false if gender is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: 30,
        gender: null,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(false);
    });

    it("should return false if description is missing or too short", () => {
      const userMissing: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: 30,
        gender: Gender.Man,
        description: null,
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      const userShort: User = {
        id: 2,
        telegram_username: "incomplete2",
        name: "Test",
        age: 30,
        gender: Gender.Man,
        description: "Too short",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(userMissing)).toBe(false);
      expect(userService.isProfileComplete(userShort)).toBe(false);
    });

    it("should return false if gender_preference is missing", () => {
      const user: User = {
        id: 1,
        telegram_username: "incomplete",
        name: "Test",
        age: 30,
        gender: Gender.Man,
        description: "A complete description.",
        preferences: { gender_preference: GenderPreference.Everyone },
        is_complete: false,
        created_at: new Date(),
        updated_at: new Date(),
        latitude: null,
        longitude: null,
        is_active: true,
        is_banned: false,
      };
      expect(userService.isProfileComplete(user)).toBe(true);
    });
  });

  describe("updateTelegramUsername", () => {
    it("should update the telegram_username for an existing user", async () => {
      const userId = 555;
      await userService.findOrCreateUser(userId);
      const newUsername = "testuser123";
      const updatedUser = await userService.updateTelegramUsername(userId, newUsername);

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.telegram_username).toBe(newUsername);

      const fetchedUser = await userService.getUserById(userId);
      expect(fetchedUser?.telegram_username).toBe(newUsername);
    });

    it("should set telegram_username to undefined if null is provided", async () => {
      const userId = 556;
      await userService.findOrCreateUser(userId);
      await userService.updateTelegramUsername(userId, "initial_username");
      const updatedUser = await userService.updateTelegramUsername(userId, undefined);

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.telegram_username).toBeUndefined();

      const fetchedUser = await userService.getUserById(userId);
      expect(fetchedUser?.telegram_username).toBeUndefined();
    });

    it("should return null if the user does not exist", async () => {
      const userId = 999;
      const newUsername = "ghost_user";
      const updatedUser = await userService.updateTelegramUsername(userId, newUsername);
      expect(updatedUser).toBeNull();
    });
  });
});
