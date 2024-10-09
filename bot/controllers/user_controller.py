from bot.services.user_service import UserService

class UserController:
    def __init__(self):
        self.user_service = UserService()

    async def create_user(self, username, age, gender, interests):
        return await self.user_service.create_user(username, age, gender, interests)

    async def get_user(self, user_id):
        return await self.user_service.get_user(user_id)

    async def update_user(self, user_id, updates):
        return await self.user_service.update_user(user_id, updates)

    async def delete_user(self, user_id):
        return await self.user_service.delete_user(user_id)